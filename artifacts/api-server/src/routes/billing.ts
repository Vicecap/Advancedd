import { Router, type Request, type Response } from "express";
import { db, tokenPurchasesTable, tokenBalancesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logSecurityEvent } from "../lib/security";

const router = Router();

/* ── Token packages ───────────────────────────────────────────────────────── */
export const PACKAGES = [
  { id: "5m",  tokens: 5_000_000,  cents: 500,  label: "5M Tokens"  },
  { id: "10m", tokens: 10_000_000, cents: 800,  label: "10M Tokens" },
  { id: "15m", tokens: 15_000_000, cents: 1200, label: "15M Tokens" },
  { id: "30m", tokens: 30_000_000, cents: 2000, label: "30M Tokens" },
  { id: "50m", tokens: 50_000_000, cents: 3500, label: "50M Tokens" },
] as const;

/* ── Custom price calculator ─────────────────────────────────────────────── */
function calcCustomPrice(tokens: number): number {
  if (tokens <= 0) return 0;

  // Find surrounding packages for interpolation
  const sorted = [...PACKAGES].sort((a, b) => a.tokens - b.tokens);

  // Below minimum: scale from first package price
  if (tokens <= sorted[0].tokens) {
    return Math.ceil((tokens / sorted[0].tokens) * sorted[0].cents);
  }
  // Above maximum: extrapolate from last two packages
  if (tokens >= sorted[sorted.length - 1].tokens) {
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const rate = (last.cents - prev.cents) / (last.tokens - prev.tokens);
    return Math.ceil(last.cents + (tokens - last.tokens) * rate);
  }

  // Find the two surrounding packages and interpolate
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (tokens >= lo.tokens && tokens <= hi.tokens) {
      const t = (tokens - lo.tokens) / (hi.tokens - lo.tokens);
      return Math.ceil(lo.cents + t * (hi.cents - lo.cents));
    }
  }

  return Math.ceil((tokens / sorted[0].tokens) * sorted[0].cents);
}

/* ── PayPal helpers ───────────────────────────────────────────────────────── */
async function getPayPalToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal not configured");

  const base = process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("PayPal auth failed");
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

function appBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "http://localhost:23183";
}

function payPalBase() {
  return process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

/* ── GET /billing/packages — list available packages ─────────────────────── */
router.get("/billing/packages", (_req: Request, res: Response): void => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const isSandbox = process.env.PAYPAL_SANDBOX === "true";
  res.json({
    packages: PACKAGES.map(p => ({
      id: p.id,
      tokens: p.tokens,
      cents: p.cents,
      usd: (p.cents / 100).toFixed(2),
      label: p.label,
    })),
    configured: !!(clientId && process.env.PAYPAL_CLIENT_SECRET),
    clientId: clientId ?? null,
    isSandbox,
  });
});

/* ── POST /billing/calc-price — custom price calculation ─────────────────── */
router.post("/billing/calc-price", (req: Request, res: Response): void => {
  const { tokens } = req.body as { tokens?: number };
  if (!tokens || tokens < 1_000_000) {
    res.status(400).json({ error: "Minimum 1 million tokens" });
    return;
  }
  const cents = calcCustomPrice(tokens);
  res.json({ tokens, cents, usd: (cents / 100).toFixed(2) });
});

/* ── POST /billing/create-order — create PayPal order ────────────────────── */
router.post("/billing/create-order", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    logSecurityEvent(req, "billing_bypass_attempt", "high",
      req.user?.id, "Unauthenticated user tried to create purchase order");
    res.status(401).json({ error: "Sign in to purchase tokens" });
    return;
  }

  const { packageId, customTokens } = req.body as {
    packageId?: string; customTokens?: number;
  };

  let tokens: number;
  let cents: number;
  let pkgLabel: string;

  if (packageId && packageId !== "custom") {
    const pkg = PACKAGES.find(p => p.id === packageId);
    if (!pkg) { res.status(400).json({ error: "Invalid package" }); return; }
    tokens = pkg.tokens;
    cents = pkg.cents;
    pkgLabel = pkg.id;
  } else if (customTokens && customTokens >= 1_000_000) {
    tokens = Math.round(customTokens);
    cents = calcCustomPrice(tokens);
    pkgLabel = "custom";
  } else {
    res.status(400).json({ error: "Invalid package or token amount" });
    return;
  }

  try {
    const accessToken = await getPayPalToken();
    const usdAmount = (cents / 100).toFixed(2);

    const orderRes = await fetch(`${payPalBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "USD", value: usdAmount },
          description: `ZimSolve ${(tokens / 1_000_000).toFixed(0)}M AI Tokens`,
        }],
        application_context: {
          brand_name: "ZimSolve AI",
          user_action: "PAY_NOW",
          // Redirect flow — works reliably in all environments (no popup required)
          return_url: `${appBaseUrl()}/api/billing/paypal-complete`,
          cancel_url: `${appBaseUrl()}/?paypal_cancelled=1`,
        },
      }),
    });

    if (!orderRes.ok) {
      const errBody = await orderRes.text();
      console.error("PayPal create-order error:", errBody);
      res.status(502).json({ error: "Failed to create PayPal order" });
      return;
    }

    const order = await orderRes.json() as {
      id: string;
      links?: Array<{ href: string; rel: string; method: string }>;
    };

    const approveUrl = order.links?.find(l => l.rel === "approve")?.href ?? null;

    // Record pending purchase
    await db.insert(tokenPurchasesTable).values({
      userId: req.user.id,
      packageId: pkgLabel,
      tokensAmount: tokens,
      amountUsdCents: cents,
      paypalOrderId: order.id,
      status: "pending",
    });

    res.json({ orderId: order.id, approveUrl, tokens, cents, usd: usdAmount });
  } catch (err) {
    console.error("billing create-order:", err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

/* ── POST /billing/capture-order — capture after user approves ───────────── */
router.post("/billing/capture-order", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { orderId } = req.body as { orderId?: string };
  if (!orderId) { res.status(400).json({ error: "orderId required" }); return; }

  try {
    const accessToken = await getPayPalToken();

    const captureRes = await fetch(`${payPalBase()}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const capture = await captureRes.json() as {
      status?: string;
      purchase_units?: Array<{
        payments?: {
          captures?: Array<{
            id?: string;
            amount?: { value?: string };
          }>;
        };
      }>;
      payer?: { email_address?: string };
    };

    if (capture.status !== "COMPLETED") {
      res.status(402).json({ error: "Payment not completed", status: capture.status });
      return;
    }

    const transactionId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const payerEmail = capture.payer?.email_address;

    // Find our purchase record
    const [purchase] = await db
      .select()
      .from(tokenPurchasesTable)
      .where(eq(tokenPurchasesTable.paypalOrderId, orderId));

    if (!purchase) {
      res.status(404).json({ error: "Purchase record not found" });
      return;
    }

    // Guard against double-capture
    if (purchase.status === "completed") {
      res.json({ ok: true, alreadyCaptured: true, tokens: purchase.tokensAmount });
      return;
    }

    // Verify this purchase belongs to the authenticated user
    if (purchase.userId !== req.user.id) {
      logSecurityEvent(req, "billing_user_mismatch", "critical", req.user.id,
        `User ${req.user.id} tried to capture order belonging to ${purchase.userId}`);
      res.status(403).json({ error: "Order does not belong to your account" });
      return;
    }

    // Credit tokens to balance
    await db.execute(
      sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
          VALUES (${req.user.id}, ${purchase.tokensAmount}, 0, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET balance = token_balances.balance + ${purchase.tokensAmount}`
    );

    // Mark purchase as completed
    await db.update(tokenPurchasesTable)
      .set({
        status: "completed",
        paypalTransactionId: transactionId,
        paypalPayerEmail: payerEmail,
        completedAt: new Date(),
      })
      .where(eq(tokenPurchasesTable.id, purchase.id));

    const [updated] = await db
      .select({ balance: tokenBalancesTable.balance })
      .from(tokenBalancesTable)
      .where(eq(tokenBalancesTable.userId, req.user.id));

    res.json({
      ok: true,
      tokens: purchase.tokensAmount,
      newBalance: updated?.balance ?? purchase.tokensAmount,
      transactionId,
    });
  } catch (err) {
    console.error("billing capture-order:", err);
    res.status(500).json({ error: "Capture failed" });
  }
});

/* ── GET /billing/paypal-complete — PayPal redirect-flow return URL ─────── */
router.get("/billing/paypal-complete", async (req: Request, res: Response): Promise<void> => {
  const appBase = appBaseUrl();
  const { token: orderId } = req.query as { token?: string };

  if (!orderId) {
    res.redirect(`${appBase}/?paypal_error=1&reason=no_order`);
    return;
  }

  if (!req.isAuthenticated()) {
    // Session expired between redirect — user must re-login
    res.redirect(`${appBase}/?paypal_error=1&reason=session_expired`);
    return;
  }

  try {
    // Find purchase record
    const [purchase] = await db
      .select()
      .from(tokenPurchasesTable)
      .where(eq(tokenPurchasesTable.paypalOrderId, orderId));

    if (!purchase) {
      res.redirect(`${appBase}/?paypal_error=1&reason=not_found`);
      return;
    }

    // Guard against double-capture
    if (purchase.status === "completed") {
      res.redirect(`${appBase}/?paypal_success=1&tokens=${purchase.tokensAmount}`);
      return;
    }

    // Verify ownership
    if (purchase.userId !== req.user.id) {
      res.redirect(`${appBase}/?paypal_error=1&reason=mismatch`);
      return;
    }

    // Capture the payment with PayPal
    const accessToken = await getPayPalToken();
    const captureRes = await fetch(`${payPalBase()}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });

    const capture = await captureRes.json() as {
      status?: string;
      payer?: { email_address?: string };
      purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string }> } }>;
    };

    if (capture.status !== "COMPLETED") {
      console.error("PayPal redirect capture failed:", capture);
      res.redirect(`${appBase}/?paypal_error=1&reason=capture_failed`);
      return;
    }

    const transactionId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const payerEmail = capture.payer?.email_address;

    // Credit tokens
    await db.execute(
      sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
          VALUES (${req.user.id}, ${purchase.tokensAmount}, 0, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET balance = token_balances.balance + ${purchase.tokensAmount}`
    );

    // Mark completed
    await db.update(tokenPurchasesTable)
      .set({ status: "completed", paypalTransactionId: transactionId, paypalPayerEmail: payerEmail, completedAt: new Date() })
      .where(eq(tokenPurchasesTable.id, purchase.id));

    res.redirect(`${appBase}/?paypal_success=1&tokens=${purchase.tokensAmount}`);
  } catch (err) {
    console.error("paypal-complete error:", err);
    res.redirect(`${appBase}/?paypal_error=1&reason=server_error`);
  }
});

/* ── GET /billing/history — user's own purchase history ──────────────────── */
router.get("/billing/history", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const rows = await db
    .select()
    .from(tokenPurchasesTable)
    .where(eq(tokenPurchasesTable.userId, req.user.id))
    .orderBy(sql`created_at DESC`)
    .limit(20);
  // Normalise to snake_case so the frontend receives consistent field names
  const purchases = rows.map(p => ({
    id: p.id,
    package_id: p.packageId,
    tokens_amount: p.tokensAmount,
    amount_usd_cents: p.amountUsdCents,
    paypal_order_id: p.paypalOrderId,
    paypal_transaction_id: p.paypalTransactionId,
    paypal_payer_email: p.paypalPayerEmail,
    status: p.status,
    created_at: p.createdAt,
    completed_at: p.completedAt,
  }));
  res.json({ purchases });
});

/* ── GET /billing/bitcoin-address — return BTC receiving address ─────────── */
router.get("/billing/bitcoin-address", (_req: Request, res: Response): void => {
  const address = process.env.BITCOIN_ADDRESS;
  res.json({ configured: !!address, address: address ?? null });
});

/* ── GET /billing/bitcoin-price — live BTC price + per-package BTC amounts ─ */
router.get("/billing/bitcoin-price", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { headers: { "Accept": "application/json" } }
    );
    if (!r.ok) throw new Error("CoinGecko unavailable");
    const data = await r.json() as { bitcoin: { usd: number } };
    const btcUsd = data.bitcoin.usd;
    const pkgsWithBtc = PACKAGES.map(p => ({
      id: p.id,
      btc: (p.cents / 100 / btcUsd).toFixed(8),
    }));
    res.json({ btcUsd, packages: pkgsWithBtc });
  } catch {
    res.status(503).json({ error: "Could not fetch BTC price. Try again shortly." });
  }
});

/* ── POST /billing/bitcoin-verify — verify tx on blockchain, credit tokens ─ */
router.post("/billing/bitcoin-verify", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to verify payment" });
    return;
  }

  const address = process.env.BITCOIN_ADDRESS;
  if (!address) {
    res.status(503).json({ error: "Bitcoin payments not configured" });
    return;
  }

  const { txHash, packageId, customTokens } = req.body as {
    txHash?: string; packageId?: string; customTokens?: number;
  };

  if (!txHash || !/^[a-fA-F0-9]{64}$/.test(txHash)) {
    res.status(400).json({ error: "Invalid transaction hash" });
    return;
  }

  let tokens: number;
  let cents: number;
  let pkgLabel: string;

  if (packageId && packageId !== "custom") {
    const pkg = PACKAGES.find(p => p.id === packageId);
    if (!pkg) { res.status(400).json({ error: "Invalid package" }); return; }
    tokens = pkg.tokens; cents = pkg.cents; pkgLabel = pkg.id;
  } else if (customTokens && customTokens >= 1_000_000) {
    tokens = Math.round(customTokens);
    cents = calcCustomPrice(tokens);
    pkgLabel = "custom";
  } else {
    res.status(400).json({ error: "Invalid package or token amount" });
    return;
  }

  const btcKey = `btc_${txHash}`;

  const [existing] = await db
    .select({ id: tokenPurchasesTable.id })
    .from(tokenPurchasesTable)
    .where(eq(tokenPurchasesTable.paypalOrderId, btcKey));

  if (existing) {
    res.status(409).json({ error: "This transaction has already been used." });
    return;
  }

  try {
    const priceRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { headers: { "Accept": "application/json" } }
    );
    if (!priceRes.ok) throw new Error("Cannot fetch BTC price");
    const priceData = await priceRes.json() as { bitcoin: { usd: number } };
    const btcUsd = priceData.bitcoin.usd;
    const usdAmount = cents / 100;
    const expectedBtc = usdAmount / btcUsd;
    const expectedSatoshis = Math.floor(expectedBtc * 1e8);
    const minSatoshis = Math.floor(expectedSatoshis * 0.80);

    const txRes = await fetch(`https://blockstream.info/api/tx/${txHash}`);
    if (!txRes.ok) {
      res.status(400).json({ error: "Transaction not found on blockchain. It may not be confirmed yet." });
      return;
    }
    const tx = await txRes.json() as {
      vout: Array<{ scriptpubkey_address?: string; value: number }>;
    };

    const output = tx.vout.find(v => v.scriptpubkey_address === address);
    if (!output) {
      res.status(400).json({ error: `No payment to the expected Bitcoin address found in this transaction.` });
      return;
    }
    if (output.value < minSatoshis) {
      const foundBtc = (output.value / 1e8).toFixed(8);
      const reqBtc = (expectedBtc * 0.80).toFixed(8);
      res.status(400).json({
        error: `Payment too low. Found ${foundBtc} BTC but needed at least ${reqBtc} BTC (80% of ${expectedBtc.toFixed(8)} BTC).`,
      });
      return;
    }

    await db.execute(
      sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
          VALUES (${req.user.id}, ${tokens}, 0, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET balance = token_balances.balance + ${tokens}`
    );

    await db.insert(tokenPurchasesTable).values({
      userId: req.user.id,
      packageId: pkgLabel,
      tokensAmount: tokens,
      amountUsdCents: cents,
      paypalOrderId: btcKey,
      paypalTransactionId: txHash,
      status: "completed",
      completedAt: new Date(),
    });

    const [updated] = await db
      .select({ balance: tokenBalancesTable.balance })
      .from(tokenBalancesTable)
      .where(eq(tokenBalancesTable.userId, req.user.id));

    res.json({ ok: true, tokens, newBalance: updated?.balance ?? tokens });
  } catch (err) {
    console.error("bitcoin-verify error:", err);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

/* ── POST /billing/webhook/paypal — PayPal IPN / Webhook ─────────────────── */
// PayPal sends events here (e.g. PAYMENT.CAPTURE.COMPLETED, ORDER.APPROVED)
// We verify the signature then credit tokens if the event hasn't been processed yet.
router.post("/billing/webhook/paypal", async (req: Request, res: Response): Promise<void> => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    // Webhook not yet configured — accept but ignore
    res.sendStatus(200);
    return;
  }

  try {
    // ── 1. Verify signature with PayPal ──────────────────────────────────────
    const accessToken = await getPayPalToken();

    const headers = req.headers as Record<string, string>;
    const verifyBody = {
      auth_algo:         headers["paypal-auth-algo"]         ?? "",
      cert_url:          headers["paypal-cert-url"]          ?? "",
      transmission_id:   headers["paypal-transmission-id"]   ?? "",
      transmission_sig:  headers["paypal-transmission-sig"]  ?? "",
      transmission_time: headers["paypal-transmission-time"] ?? "",
      webhook_id: webhookId,
      webhook_event: req.body,
    };

    const verifyRes = await fetch(
      `${payPalBase()}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(verifyBody),
      }
    );

    if (!verifyRes.ok) {
      console.error("PayPal webhook verify HTTP error:", verifyRes.status);
      res.sendStatus(400);
      return;
    }

    const verify = await verifyRes.json() as { verification_status?: string };
    if (verify.verification_status !== "SUCCESS") {
      console.warn("PayPal webhook signature invalid:", verify.verification_status);
      res.sendStatus(400);
      return;
    }

    // ── 2. Handle event ───────────────────────────────────────────────────────
    const event = req.body as {
      event_type?: string;
      resource?: {
        id?: string;                        // capture ID
        supplementary_data?: { related_ids?: { order_id?: string } };
        amount?: { value?: string };
        payer?: { email_address?: string };
        purchase_units?: Array<{
          reference_id?: string;
          payments?: { captures?: Array<{ id?: string; amount?: { value?: string } }> };
        }>;
      };
    };

    const eventType = event.event_type ?? "";
    console.log("PayPal webhook event:", eventType);

    // We care about PAYMENT.CAPTURE.COMPLETED
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const resource = event.resource ?? {};
      const orderId = resource.supplementary_data?.related_ids?.order_id;

      if (!orderId) {
        console.warn("PayPal webhook: no order_id in capture event");
        res.sendStatus(200);
        return;
      }

      // Find matching pending purchase
      const [purchase] = await db
        .select()
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.paypalOrderId, orderId));

      if (!purchase) {
        console.warn("PayPal webhook: no purchase found for order", orderId);
        res.sendStatus(200);
        return;
      }

      // Guard double-credit
      if (purchase.status === "completed") {
        res.sendStatus(200);
        return;
      }

      const captureId = resource.id ?? null;
      const payerEmail = resource.payer?.email_address ?? null;

      // Credit tokens
      await db.execute(
        sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
            VALUES (${purchase.userId}, ${purchase.tokensAmount}, 0, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET balance = token_balances.balance + ${purchase.tokensAmount}`
      );

      // Mark completed
      await db.update(tokenPurchasesTable)
        .set({
          status: "completed",
          paypalTransactionId: captureId,
          paypalPayerEmail: payerEmail,
          completedAt: new Date(),
        })
        .where(eq(tokenPurchasesTable.id, purchase.id));

      console.log(`PayPal webhook: credited ${purchase.tokensAmount} tokens to user ${purchase.userId} via webhook`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("PayPal webhook error:", err);
    res.sendStatus(500);
  }
});

export default router;
