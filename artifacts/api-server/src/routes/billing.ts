import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { db, tokenPurchasesTable, tokenBalancesTable } from "@workspace/db";
import { eq, sql, and, lt, desc } from "drizzle-orm";
import { logSecurityEvent } from "../lib/security";
import { usersTable } from "@workspace/db";
import { redisRateLimit } from "../lib/rate-limiter";
import {
  sendPaymentReceiptEmail,
  sendManualPaymentStatusEmail,
} from "../lib/email";

const router = Router();
function paramOne(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] : (value ?? ""); }

/* ── Token packages ───────────────────────────────────────────────────────── */
export const PACKAGES = [
  { id: "pkg_5",  tokens: 500_000,    cents: 500,  label: "500K Tokens"  },
  { id: "pkg_8",  tokens: 1_000_000,  cents: 800,  label: "1M Tokens" },
  { id: "pkg_15", tokens: 2_000_000,  cents: 1500, label: "2M Tokens" },
  { id: "pkg_30", tokens: 5_000_000,  cents: 3000, label: "5M Tokens" },
  { id: "pkg_50", tokens: 10_000_000, cents: 5000, label: "10M Tokens" },
] as const;

/* ── Rate limit presets ───────────────────────────────────────────────────── */
// Strict: 5 attempts per 10 minutes — for payment creation/verification
const strictPaymentLimit = redisRateLimit({
  windowSecs: 600,
  max: 5,
  keyPrefix: "rl:billing:strict",
  message: "Too many payment attempts. Please wait 10 minutes before trying again.",
});

// Moderate: 20 per 5 minutes — for proof submission, price calc
const moderateLimit = redisRateLimit({
  windowSecs: 300,
  max: 20,
  keyPrefix: "rl:billing:moderate",
  message: "Too many requests. Please slow down.",
});

// Loose: 60 per minute — for read endpoints like packages, history
const looseLimit = redisRateLimit({
  windowSecs: 60,
  max: 60,
  keyPrefix: "rl:billing:loose",
  message: "Too many requests.",
});

/* ── Helper: get user email for receipts ─────────────────────────────────── */
async function getUserEmail(userId: string): Promise<{ email: string | null; username: string | null } | null> {
  const [user] = await db
    .select({ email: usersTable.email, username: usersTable.firstName })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

/* ── Helper: build package label ─────────────────────────────────────────── */
function buildPackageLabel(pkgLabel: string, tokens: number): string {
  const pkg = PACKAGES.find(p => p.id === pkgLabel);
  if (pkg) return pkg.label;
  if (pkgLabel === "custom") return `${(tokens / 1_000_000).toFixed(1)}M Tokens (Custom)`;
  if (pkgLabel === "admin_grant") return "Admin Token Grant";
  return pkgLabel;
}

/* ── Auto-clean pending payments older than 1 week ───────────────────────── */
async function cleanStalePendingPayments(): Promise<number> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const result = await db
      .update(tokenPurchasesTable)
      .set({
        status: "expired",
        adminNote: "Auto-expired after 1 week with no confirmation",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(tokenPurchasesTable.status, "pending_manual"),
          lt(tokenPurchasesTable.createdAt, oneWeekAgo)
        )
      )
      .returning({ id: tokenPurchasesTable.id });

    if (result.length > 0) {
      console.log(`[auto-clean] Expired ${result.length} stale pending payment(s)`);
    }
    return result.length;
  } catch (err) {
    console.error("[auto-clean] Failed to clean stale pending payments:", err);
    return 0;
  }
}

cleanStalePendingPayments();
setInterval(cleanStalePendingPayments, 60 * 60 * 1000);

/* ── Custom price calculator ─────────────────────────────────────────────── */
function calcCustomPrice(tokens: number): number {
  if (tokens <= 0) return 0;
  const sorted = [...PACKAGES].sort((a, b) => a.tokens - b.tokens);

  if (tokens <= sorted[0].tokens) {
    return Math.ceil((tokens / sorted[0].tokens) * sorted[0].cents);
  }

  if (tokens >= sorted[sorted.length - 1].tokens) {
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const rate = (last.cents - prev.cents) / (last.tokens - prev.tokens);
    return Math.ceil(last.cents + (tokens - last.tokens) * rate);
  }

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

  const base = (process.env.PAYPAL_ENV ?? "live") === "sandbox"
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
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "http://localhost:23183";
}

function payPalBase() {
  return (process.env.PAYPAL_ENV ?? "live") === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

function generateReference(prefix: string = "PAY"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return `${prefix}-${code}`;
}

/* ── Input sanitiser — strip non-printable chars ─────────────────────────── */

function normaliseDischubPhone(phone: string): string | null {
  const compact = phone.replace(/[\s-]/g, "");
  if (/^\+2637\d{8}$/.test(compact)) return compact;
  if (/^02637\d{8}$/.test(compact)) return `+${compact.slice(1)}`;
  if (/^07\d{8}$/.test(compact)) return `+263${compact.slice(1)}`;
  return null;
}

function dischubBase(): string {
  return (process.env.DISCHUB_API_BASE_URL ?? "https://dischub.co.zw").replace(/\/$/, "");
}

function generateDischubOrderId(): string {
  return `ZS${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`.slice(0, 30);
}

async function verifyDischubStatus(orderId: string): Promise<{ status: "success" | "pending" | "failed"; metadata: unknown }> {
  const apiKey = process.env.DISCHUB_API_KEY;
  const recipient = process.env.DISCHUB_RECIPIENT_EMAIL;
  if (!apiKey || !recipient) throw new Error("DiscHub is not configured");
  const response = await fetch(`${dischubBase()}/api/payment/status/3/step/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ order_id: orderId, recipient }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("DiscHub verification failed");
  const data = await response.json() as { status?: string; payment_status?: string };
  const status = String(data.status ?? data.payment_status ?? "pending").toLowerCase();
  if (!["success", "pending", "failed"].includes(status)) return { status: "pending", metadata: data };
  return { status: status as "success" | "pending" | "failed", metadata: data };
}

async function creditDischubPurchase(req: Request, purchase: typeof tokenPurchasesTable.$inferSelect, providerMetadata: unknown): Promise<boolean> {
  let credited = false;
  await db.transaction(async (tx) => {
    const now = new Date();
    const [claimed] = await tx
      .update(tokenPurchasesTable)
      .set({
        status: "completed",
        completedAt: now,
        creditedAt: now,
        verifiedAt: now,
        providerMetadata,
      })
      .where(and(eq(tokenPurchasesTable.id, purchase.id), sql`${tokenPurchasesTable.creditedAt} IS NULL`))
      .returning({ id: tokenPurchasesTable.id });

    if (!claimed) return;

    await tx.execute(sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
      VALUES (${purchase.userId}, ${purchase.tokensAmount}, 0, NOW())
      ON CONFLICT (user_id) DO UPDATE SET balance = token_balances.balance + ${purchase.tokensAmount}`);
    credited = true;
  });

  if (!credited) {
    await logSecurityEvent(req, "payment_duplicate_credit", "high", purchase.userId, "Duplicate DiscHub credit attempt", { orderId: purchase.providerOrderId, blocked: true });
  }
  return credited;
}

function sanitiseString(val: unknown, maxLen = 500): string {
  if (typeof val !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return val.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, maxLen);
}

/* ══════════════════════════════════════════════════════════════════════════
   MANUAL PAYMENT ROUTES
══════════════════════════════════════════════════════════════════════════ */

router.get(
  "/billing/manual-payment-config",
  looseLimit,
  (_req: Request, res: Response) => {
    res.json({
      ecocash: {
        enabled: process.env.ECOCASH_ENABLED === "true",
        number: process.env.ECOCASH_NUMBER ?? "",
        instructions: process.env.ECOCASH_INSTRUCTIONS ?? "",
      },
      ecocash_diaspora: {
        enabled: process.env.ECOCASH_DIASPORA_ENABLED === "true",
        number: process.env.ECOCASH_DIASPORA_NUMBER ?? "",
        instructions: process.env.ECOCASH_DIASPORA_INSTRUCTIONS ?? "",
      },
      bank: {
        enabled: process.env.BANK_ENABLED === "true",
        details: process.env.BANK_DETAILS ?? "",
        instructions: process.env.BANK_INSTRUCTIONS ?? "",
      },
    });
  }
);

router.post(
  "/billing/manual-payment/create",
  strictPaymentLimit,
  (req: Request, res: Response, next: Function) => {
    if (!req.isAuthenticated?.()) {
      logSecurityEvent(
        req, "manual_payment_bypass", "high",
        req.user?.id, "Unauthenticated manual payment attempt"
      );
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  },
  async (req: Request, res: Response) => {
    const rawMethod = req.body?.paymentMethod;
    const rawPackageId = req.body?.packageId;
    const rawCustomTokens = req.body?.customTokens;

    const validMethods = ["ecocash", "ecocash_diaspora", "bank"] as const;
    type ManualMethod = typeof validMethods[number];

    if (!rawMethod || !validMethods.includes(rawMethod as ManualMethod)) {
      return res.status(400).json({ error: "Invalid payment method" });
    }
    const paymentMethod = rawMethod as ManualMethod;

    // Validate packageId is a known safe string
    const packageId = typeof rawPackageId === "string"
      ? rawPackageId.replace(/[^a-z0-9_-]/gi, "").slice(0, 20)
      : undefined;

    // Validate customTokens is a safe positive integer
    const customTokens =
      rawCustomTokens !== undefined && Number.isFinite(Number(rawCustomTokens))
        ? Math.floor(Number(rawCustomTokens))
        : undefined;

    let tokens: number;
    let cents: number;
    let pkgLabel: string;

    if (packageId && packageId !== "custom") {
      const pkg = PACKAGES.find((p) => p.id === packageId);
      if (!pkg) return res.status(400).json({ error: "Invalid package" });
      tokens = pkg.tokens;
      cents = pkg.cents;
      pkgLabel = pkg.id;
    } else if (customTokens && customTokens >= 100_000) {
      tokens = customTokens;
      cents = calcCustomPrice(tokens);
      pkgLabel = "custom";
    } else {
      return res.status(400).json({ error: "Invalid package or token amount" });
    }

    // Hard cap: 500M tokens per purchase
    if (tokens > 500_000_000) {
      return res.status(400).json({ error: "Token amount exceeds maximum per purchase" });
    }

    const prefixMap: Record<ManualMethod, string> = {
      ecocash: "ECO",
      ecocash_diaspora: "DIA",
      bank: "BNK",
    };
    const prefix = prefixMap[paymentMethod];

    let reference: string;
    let attempts = 0;
    do {
      reference = generateReference(prefix);
      const existing = await db
        .select({ id: tokenPurchasesTable.id })
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.manualReference, reference))
        .limit(1);
      if (!existing.length) break;
      attempts++;
    } while (attempts < 20);

    if (attempts >= 20) {
      return res.status(500).json({ error: "Failed to generate unique reference — try again" });
    }

    const [purchase] = await db
      .insert(tokenPurchasesTable)
      .values({
        userId: req.user!.id,
        packageId: pkgLabel,
        tokensAmount: tokens,
        amountUsdCents: cents,
        paymentMethod,
        manualReference: reference!,
        status: "pending_manual",
        createdAt: new Date(),
      })
      .returning();

    res.json({
      ok: true,
      reference: reference!,
      purchaseId: purchase.id,
      tokens,
      cents,
      usd: (cents / 100).toFixed(2),
    });
  }
);

router.post(
  "/billing/manual-payment/submit-proof",
  moderateLimit,
  (req: Request, res: Response, next: Function) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  },
  async (req: Request, res: Response) => {
    const purchaseId =
      Number.isFinite(Number(req.body?.purchaseId))
        ? Math.floor(Number(req.body.purchaseId))
        : null;

    // Sanitise user reference — only allow printable ASCII, max 100 chars
    const userReference = sanitiseString(req.body?.userReference, 100);

    if (!purchaseId || purchaseId < 1 || !userReference) {
      return res.status(400).json({ error: "purchaseId and userReference required" });
    }

    const [purchase] = await db
      .select()
      .from(tokenPurchasesTable)
      .where(
        and(
          eq(tokenPurchasesTable.id, purchaseId),
          eq(tokenPurchasesTable.userId, req.user!.id),
          eq(tokenPurchasesTable.status, "pending_manual")
        )
      );

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found or already processed" });
    }

    await db
      .update(tokenPurchasesTable)
      .set({
        userPaymentReference: userReference,
        proofSubmittedAt: new Date(),
      })
      .where(eq(tokenPurchasesTable.id, purchaseId));

    res.json({ ok: true });
  }
);

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════════════════════════════════════════ */

// Admin rate limit — generous but not unlimited
const adminLimit = redisRateLimit({
  windowSecs: 60,
  max: 120,
  keyPrefix: "rl:admin:billing",
  message: "Admin rate limit reached.",
});

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated?.() || !req.user?.isAdmin) {
    logSecurityEvent(
      req, "admin_access_denied", "high",
      req.user?.id, `Non-admin attempted admin billing route: ${req.path}`
    );
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

router.get(
  "/admin/billing/manual-payments",
  adminLimit,
  requireAdmin,
  async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const offset = (page - 1) * limit;
    const statusFilter = sanitiseString(req.query.status as string || "pending_manual", 40);

    const payments = await db
      .select({
        id: tokenPurchasesTable.id,
        userId: tokenPurchasesTable.userId,
        email: usersTable.email,
        username: usersTable.firstName,
        tokensAmount: tokenPurchasesTable.tokensAmount,
        amountUsdCents: tokenPurchasesTable.amountUsdCents,
        paymentMethod: tokenPurchasesTable.paymentMethod,
        manualReference: tokenPurchasesTable.manualReference,
        userPaymentReference: tokenPurchasesTable.userPaymentReference,
        status: tokenPurchasesTable.status,
        createdAt: tokenPurchasesTable.createdAt,
        proofSubmittedAt: tokenPurchasesTable.proofSubmittedAt,
        adminNote: tokenPurchasesTable.adminNote,
      })
      .from(tokenPurchasesTable)
      .leftJoin(usersTable, eq(tokenPurchasesTable.userId, usersTable.id))
      .where(eq(tokenPurchasesTable.status, statusFilter))
      .orderBy(desc(tokenPurchasesTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tokenPurchasesTable)
      .where(eq(tokenPurchasesTable.status, statusFilter));

    res.json({
      payments,
      pagination: { page, limit, total: Number(totalResult.count) },
    });
  }
);

router.post(
  "/admin/billing/manual-payments/:id/approve",
  adminLimit,
  requireAdmin,
  async (req: Request, res: Response) => {
    const purchaseId = parseInt(paramOne(req.params.id));
    if (isNaN(purchaseId) || purchaseId < 1) {
      return res.status(400).json({ error: "Invalid purchase ID" });
    }

    const adminNote = sanitiseString(req.body?.adminNote, 500) || null;

    const [purchase] = await db
      .select()
      .from(tokenPurchasesTable)
      .where(
        and(
          eq(tokenPurchasesTable.id, purchaseId),
          eq(tokenPurchasesTable.status, "pending_manual")
        )
      );

    if (!purchase) {
      return res.status(404).json({ error: "Pending manual purchase not found" });
    }

    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
              VALUES (${purchase.userId}, ${purchase.tokensAmount}, 0, NOW())
              ON CONFLICT (user_id)
              DO UPDATE SET balance = token_balances.balance + ${purchase.tokensAmount}`
        );

        await tx
          .update(tokenPurchasesTable)
          .set({
            status: "completed",
            completedAt: new Date(),
            adminNote,
            approvedBy: req.user!.id,
          })
          .where(eq(tokenPurchasesTable.id, purchaseId));
      });

      const [balance] = await db
        .select({ balance: tokenBalancesTable.balance })
        .from(tokenBalancesTable)
        .where(eq(tokenBalancesTable.userId, purchase.userId));

      const newBalance = balance?.balance ?? purchase.tokensAmount;

      // Send approval receipt email — fire and forget
      const userInfo = await getUserEmail(purchase.userId);
      if (userInfo?.email) {
        // Full receipt email
        sendPaymentReceiptEmail(userInfo.email, {
          purchaseId: purchase.id,
          username: userInfo.username,
          tokensAmount: purchase.tokensAmount,
          amountUsdCents: purchase.amountUsdCents,
          paymentMethod: purchase.paymentMethod ?? "manual",
          transactionId: null,
          manualReference: purchase.manualReference,
          packageLabel: buildPackageLabel(purchase.packageId, purchase.tokensAmount),
          completedAt: new Date(),
          newBalance,
        }).catch(err => console.error("[RECEIPT] Email failed:", err));

        // Also send specific approval status email
        sendManualPaymentStatusEmail(userInfo.email, {
          status: "approved",
          purchaseId: purchase.id,
          tokensAmount: purchase.tokensAmount,
          amountUsdCents: purchase.amountUsdCents,
          manualReference: purchase.manualReference ?? "",
          paymentMethod: purchase.paymentMethod ?? "manual",
          adminNote,
          newBalance,
        }).catch(err => console.error("[STATUS EMAIL] Failed:", err));
      }

      res.json({
        ok: true,
        tokensCredited: purchase.tokensAmount,
        newBalance,
      });
    } catch (err) {
      console.error("Manual approve error:", err);
      res.status(500).json({ error: "Failed to approve payment" });
    }
  }
);

router.post(
  "/admin/billing/manual-payments/:id/reject",
  adminLimit,
  requireAdmin,
  async (req: Request, res: Response) => {
    const purchaseId = parseInt(paramOne(req.params.id));
    if (isNaN(purchaseId) || purchaseId < 1) {
      return res.status(400).json({ error: "Invalid purchase ID" });
    }

    const reason = sanitiseString(req.body?.reason, 500) || "Rejected by admin";

    const [purchase] = await db
      .select()
      .from(tokenPurchasesTable)
      .where(
        and(
          eq(tokenPurchasesTable.id, purchaseId),
          eq(tokenPurchasesTable.status, "pending_manual")
        )
      );

    if (!purchase) {
      return res.status(404).json({ error: "Pending manual purchase not found" });
    }

    await db
      .update(tokenPurchasesTable)
      .set({
        status: "rejected",
        completedAt: new Date(),
        adminNote: reason,
        approvedBy: req.user!.id,
      })
      .where(eq(tokenPurchasesTable.id, purchaseId));

    // Send rejection email — fire and forget
    const userInfo = await getUserEmail(purchase.userId);
    if (userInfo?.email) {
      sendManualPaymentStatusEmail(userInfo.email, {
        status: "rejected",
        purchaseId: purchase.id,
        tokensAmount: purchase.tokensAmount,
        amountUsdCents: purchase.amountUsdCents,
        manualReference: purchase.manualReference ?? "",
        paymentMethod: purchase.paymentMethod ?? "manual",
        adminNote: reason,
      }).catch(err => console.error("[STATUS EMAIL] Failed:", err));
    }

    res.json({ ok: true });
  }
);

router.post(
  "/admin/billing/manual-payments/clean-stale",
  adminLimit,
  requireAdmin,
  async (req: Request, res: Response) => {
    const days = Number(req.body?.days ?? 7);

    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: "days must be an integer between 1 and 365" });
    }

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const expired = await db
        .update(tokenPurchasesTable)
        .set({
          status: "expired",
          adminNote: `Manually expired by admin (older than ${days} day${days === 1 ? "" : "s"})`,
          completedAt: new Date(),
          approvedBy: req.user!.id,
        })
        .where(
          and(
            eq(tokenPurchasesTable.status, "pending_manual"),
            lt(tokenPurchasesTable.createdAt, cutoff)
          )
        )
        .returning({ id: tokenPurchasesTable.id });

      res.json({
        ok: true,
        expired: expired.length,
        message: `Expired ${expired.length} pending payment(s) older than ${days} day(s)`,
      });
    } catch (err) {
      console.error("Admin clean-stale error:", err);
      res.status(500).json({ error: "Failed to clean stale payments" });
    }
  }
);

router.post(
  "/admin/billing/grant-tokens",
  adminLimit,
  requireAdmin,
  async (req: Request, res: Response) => {
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : null;
    const tokens = Number.isFinite(Number(req.body?.tokens))
      ? Math.floor(Number(req.body.tokens))
      : null;
    const reason = sanitiseString(req.body?.reason, 500) || "Manual grant by admin";

    if (!userId || !tokens || tokens < 1) {
      return res.status(400).json({ error: "userId and positive tokens required" });
    }

    if (tokens > 1_000_000_000) {
      return res.status(400).json({ error: "Token grant exceeds maximum allowed (1B)" });
    }

    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
              VALUES (${userId}, ${tokens}, 0, NOW())
              ON CONFLICT (user_id)
              DO UPDATE SET balance = token_balances.balance + ${tokens}`
        );

        await tx.insert(tokenPurchasesTable).values({
          userId,
          packageId: "admin_grant",
          tokensAmount: tokens,
          amountUsdCents: 0,
          paymentMethod: "manual",
          status: "completed",
          adminNote: reason,
          approvedBy: req.user!.id,
          createdAt: new Date(),
          completedAt: new Date(),
        });
      });

      const [balance] = await db
        .select({ balance: tokenBalancesTable.balance })
        .from(tokenBalancesTable)
        .where(eq(tokenBalancesTable.userId, userId));

      const newBalance = balance?.balance ?? tokens;

      // Send receipt for admin grants
      const userInfo = await getUserEmail(userId);
      if (userInfo?.email) {
        sendPaymentReceiptEmail(userInfo.email, {
          purchaseId: 0, // admin grant — no DB ID available here
          username: userInfo.username,
          tokensAmount: tokens,
          amountUsdCents: 0,
          paymentMethod: "manual",
          transactionId: null,
          manualReference: null,
          packageLabel: "Admin Token Grant",
          completedAt: new Date(),
          newBalance,
        }).catch(err => console.error("[RECEIPT] Admin grant email failed:", err));
      }

      res.json({ ok: true, tokensGranted: tokens, newBalance });
    } catch (err) {
      console.error("Manual token grant error:", err);
      res.status(500).json({ error: "Failed to grant tokens" });
    }
  }
);

// Legacy alias
router.post(
  "/admin/billing/manual-tokens",
  adminLimit,
  requireAdmin,
  async (req: Request, res: Response) => {
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : null;
    const tokens = Number.isFinite(Number(req.body?.tokens))
      ? Math.floor(Number(req.body.tokens))
      : null;
    const reason = sanitiseString(req.body?.reason, 500) || "Manual grant by admin";

    if (!userId || !tokens || tokens < 1) {
      return res.status(400).json({ error: "userId and positive tokens required" });
    }

    if (tokens > 1_000_000_000) {
      return res.status(400).json({ error: "Token grant exceeds maximum allowed (1B)" });
    }

    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
              VALUES (${userId}, ${tokens}, 0, NOW())
              ON CONFLICT (user_id)
              DO UPDATE SET balance = token_balances.balance + ${tokens}`
        );

        await tx.insert(tokenPurchasesTable).values({
          userId,
          packageId: "admin_grant",
          tokensAmount: tokens,
          amountUsdCents: 0,
          paymentMethod: "manual",
          status: "completed",
          adminNote: reason,
          approvedBy: req.user!.id,
          createdAt: new Date(),
          completedAt: new Date(),
        });
      });

      const [balance] = await db
        .select({ balance: tokenBalancesTable.balance })
        .from(tokenBalancesTable)
        .where(eq(tokenBalancesTable.userId, userId));

      const newBalance = balance?.balance ?? tokens;

      const userInfo = await getUserEmail(userId);
      if (userInfo?.email) {
        sendPaymentReceiptEmail(userInfo.email, {
          purchaseId: 0,
          username: userInfo.username,
          tokensAmount: tokens,
          amountUsdCents: 0,
          paymentMethod: "manual",
          transactionId: null,
          manualReference: null,
          packageLabel: "Admin Token Grant",
          completedAt: new Date(),
          newBalance,
        }).catch(err => console.error("[RECEIPT] Admin grant email failed:", err));
      }

      res.json({ ok: true, tokensGranted: tokens, newBalance });
    } catch (err) {
      console.error("Manual token grant error:", err);
      res.status(500).json({ error: "Failed to grant tokens" });
    }
  }
);

router.get(
  "/admin/billing/stats",
  adminLimit,
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const [pending] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.status, "pending_manual"));

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [stale] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tokenPurchasesTable)
        .where(
          and(
            eq(tokenPurchasesTable.status, "pending_manual"),
            lt(tokenPurchasesTable.createdAt, oneWeekAgo)
          )
        );

      const [completed] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.status, "completed"));

      const [expired] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.status, "expired"));

      res.json({
        pending: Number(pending.count),
        stale: Number(stale.count),
        completed: Number(completed.count),
        expired: Number(expired.count),
      });
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  }
);

/* ══════════════════════════════════════════════════════════════════════════
   PAYPAL ROUTES
══════════════════════════════════════════════════════════════════════════ */

const BTC_TEST_MODE = process.env.BTC_TEST_MODE === "true";

router.get("/billing/packages", looseLimit, (_req: Request, res: Response): void => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const isSandbox = (process.env.PAYPAL_ENV ?? "live") === "sandbox";
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

router.post("/billing/calc-price", moderateLimit, (req: Request, res: Response): void => {
  const raw = Number(req.body?.tokens);
  if (!Number.isFinite(raw) || raw < 100_000) {
    res.status(400).json({ error: "Minimum 100,000 tokens" });
    return;
  }
  const tokens = Math.floor(raw);
  const cents = calcCustomPrice(tokens);
  res.json({ tokens, cents, usd: (cents / 100).toFixed(2) });
});

router.post("/billing/dischub/create-order", strictPaymentLimit, async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    await logSecurityEvent(req, "dischub_unauthenticated_create", "high", null, "Unauthenticated DiscHub order attempt", { blocked: true });
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const apiKey = process.env.DISCHUB_API_KEY;
  const recipient = process.env.DISCHUB_RECIPIENT_EMAIL;
  if (!apiKey || !recipient) {
    await logSecurityEvent(req, "dischub_missing_config", "high", req.user.id, "DiscHub create attempted without server configuration", { blocked: true });
    res.status(503).json({ error: "DiscHub is not configured" });
    return;
  }
  const packageId = typeof req.body?.packageId === "string" ? req.body.packageId.replace(/[^a-z0-9_-]/gi, "").slice(0, 20) : "";
  const pkg = PACKAGES.find((p) => p.id === packageId);
  if (!pkg) { res.status(400).json({ error: "Invalid package" }); return; }
  const currency = String(req.body?.currency ?? "USD").toUpperCase();
  if (!["USD", "ZWG"].includes(currency)) { res.status(400).json({ error: "Unsupported currency" }); return; }
  const sender = normaliseDischubPhone(String(req.body?.senderPhone ?? req.body?.phone ?? ""));
  if (!sender) { res.status(400).json({ error: "Invalid sender phone number" }); return; }
  const amount = pkg.cents / 100;
  if (!(amount > 0 && amount < 481)) {
    await logSecurityEvent(req, "dischub_amount_rejected", "high", req.user.id, "DiscHub amount outside allowed range", { packageId, amount, blocked: true });
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  let orderId = generateDischubOrderId();
  for (let i = 0; i < 5; i++) {
    const existing = await db.select({ id: tokenPurchasesTable.id }).from(tokenPurchasesTable).where(eq(tokenPurchasesTable.providerOrderId, orderId)).limit(1);
    if (!existing.length) break;
    orderId = generateDischubOrderId();
  }
  const [purchase] = await db.insert(tokenPurchasesTable).values({
    userId: req.user.id, packageId: pkg.id, tokensAmount: pkg.tokens, amountUsdCents: pkg.cents, provider: "dischub", providerOrderId: orderId, paymentMethod: "dischub", currency, senderPhone: sender, status: "pending", createdAt: new Date(),
  }).returning();
  const callbackUrl = process.env.DISCHUB_CALLBACK_URL || `${appBaseUrl()}/api/billing/dischub/callback`;
  const redirectUrl = process.env.DISCHUB_REDIRECT_URL || `${appBaseUrl()}/payment/status`;
  try {
    const response = await fetch(`${dischubBase()}/api/orders/create/`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ order_id: orderId, sender, recipient, amount, currency, callback_url: callbackUrl, redirect_url: redirectUrl, mode: process.env.DISCHUB_MODE ?? "test" }),
      signal: AbortSignal.timeout(15000),
    });
    const metadata = await response.json().catch(() => ({}));
    await db.update(tokenPurchasesTable).set({ providerMetadata: { create: metadata } }).where(eq(tokenPurchasesTable.id, purchase.id));
    if (!response.ok) {
      await logSecurityEvent(req, "dischub_create_failed", "high", req.user.id, "DiscHub create API failed", { orderId, status: response.status });
      res.status(502).json({ error: "DiscHub order creation failed" });
      return;
    }
    res.json({ ok: true, orderId, paymentUrl: `${dischubBase()}/api/make/payment/to/${encodeURIComponent(orderId)}` });
  } catch {
    await logSecurityEvent(req, "dischub_create_error", "high", req.user.id, "DiscHub create request failed", { orderId });
    res.status(502).json({ error: "DiscHub unavailable" });
  }
});

async function refreshDischubOrder(req: Request, orderId: string) {
  const [purchase] = await db.select().from(tokenPurchasesTable).where(eq(tokenPurchasesTable.providerOrderId, orderId));
  if (!purchase) return null;
  const verified = await verifyDischubStatus(orderId);
  if (verified.status === "success") await creditDischubPurchase(req, purchase, verified.metadata);
  else await db.update(tokenPurchasesTable).set({ status: verified.status, verifiedAt: new Date(), providerMetadata: verified.metadata }).where(eq(tokenPurchasesTable.id, purchase.id));
  return (await db.select().from(tokenPurchasesTable).where(eq(tokenPurchasesTable.id, purchase.id)))[0];
}

router.post("/billing/dischub/status", strictPaymentLimit, async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
  const orderId = sanitiseString(req.body?.orderId, 30);
  const [purchase] = await db.select().from(tokenPurchasesTable).where(eq(tokenPurchasesTable.providerOrderId, orderId));
  if (!purchase || (purchase.userId !== req.user.id && !req.user.isAdmin)) {
    await logSecurityEvent(req, "dischub_order_forbidden", "high", req.user.id, "DiscHub status ownership check failed", { orderId, blocked: true });
    res.status(404).json({ error: "Order not found" }); return;
  }
  try { const updated = await refreshDischubOrder(req, orderId); res.json({ orderId, status: updated?.status ?? purchase.status, credited: !!updated?.creditedAt }); }
  catch { await logSecurityEvent(req, "dischub_verify_failed", "high", req.user.id, "DiscHub verification failed", { orderId }); res.status(502).json({ error: "Verification failed" }); }
});

router.post("/billing/dischub/callback", strictPaymentLimit, async (req: Request, res: Response): Promise<void> => {
  const orderId = sanitiseString(req.body?.order_id ?? req.body?.orderId, 30);
  if (!orderId) { await logSecurityEvent(req, "dischub_invalid_callback", "high", null, "DiscHub callback missing order_id", { blocked: true }); res.sendStatus(400); return; }
  try { await refreshDischubOrder(req, orderId); res.json({ ok: true }); }
  catch { await logSecurityEvent(req, "dischub_callback_verify_failed", "high", null, "DiscHub callback verification failed", { orderId, blocked: true }); res.sendStatus(400); }
});

router.get("/billing/dischub/status/:orderId", looseLimit, async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
  const orderId = sanitiseString(req.params.orderId, 30);
  const [purchase] = await db.select().from(tokenPurchasesTable).where(eq(tokenPurchasesTable.providerOrderId, orderId));
  if (!purchase || (purchase.userId !== req.user.id && !req.user.isAdmin)) { res.status(404).json({ error: "Order not found" }); return; }
  let row = purchase;
  if (purchase.status === "pending") { try { row = await refreshDischubOrder(req, orderId) ?? purchase; } catch { /* keep local status */ } }
  res.json({ orderId, status: row.status, packageId: row.packageId, tokenAmount: row.tokensAmount, amount: row.amountUsdCents / 100, currency: row.currency, creditedAt: row.creditedAt, verifiedAt: row.verifiedAt });
});

router.post(
  "/billing/create-order",
  strictPaymentLimit,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      logSecurityEvent(
        req, "billing_bypass_attempt", "high",
        req.user?.id, "Unauthenticated user tried to create purchase order"
      );
      res.status(401).json({ error: "Sign in to purchase tokens" });
      return;
    }

    const rawPackageId = req.body?.packageId;
    const rawCustomTokens = req.body?.customTokens;

    const packageId = typeof rawPackageId === "string"
      ? rawPackageId.replace(/[^a-z0-9_-]/gi, "").slice(0, 20)
      : undefined;

    const customTokens =
      rawCustomTokens !== undefined && Number.isFinite(Number(rawCustomTokens))
        ? Math.floor(Number(rawCustomTokens))
        : undefined;

    let tokens: number;
    let cents: number;
    let pkgLabel: string;

    if (packageId && packageId !== "custom") {
      const pkg = PACKAGES.find(p => p.id === packageId);
      if (!pkg) { res.status(400).json({ error: "Invalid package" }); return; }
      tokens = pkg.tokens;
      cents = pkg.cents;
      pkgLabel = pkg.id;
    } else if (customTokens && customTokens >= 100_000) {
      tokens = customTokens;
      cents = calcCustomPrice(tokens);
      pkgLabel = "custom";
    } else {
      res.status(400).json({ error: "Invalid package or token amount" });
      return;
    }

    if (tokens > 500_000_000) {
      res.status(400).json({ error: "Token amount exceeds maximum per purchase" });
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
  }
);

router.post(
  "/billing/capture-order",
  strictPaymentLimit,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const orderId = sanitiseString(req.body?.orderId, 100);
    if (!orderId) { res.status(400).json({ error: "orderId required" }); return; }

    // Basic PayPal order ID format check
    if (!/^[A-Z0-9]{5,20}$/.test(orderId)) {
      logSecurityEvent(
        req, "invalid_paypal_order_id", "medium",
        req.user?.id, `Malformed orderId: ${orderId}`
      );
      res.status(400).json({ error: "Invalid order ID format" });
      return;
    }

    try {
      const accessToken = await getPayPalToken();

      const captureRes = await fetch(
        `${payPalBase()}/v2/checkout/orders/${orderId}/capture`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const capture = await captureRes.json() as {
        status?: string;
        purchase_units?: Array<{
          payments?: {
            captures?: Array<{ id?: string; amount?: { value?: string } }>;
          };
        }>;
        payer?: { email_address?: string };
      };

      if (capture.status !== "COMPLETED") {
        res.status(402).json({ error: "Payment not completed", status: capture.status });
        return;
      }

      const transactionId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
      const payerEmail = capture.payer?.email_address ?? null;

      const [purchase] = await db
        .select()
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.paypalOrderId, orderId));

      if (!purchase) {
        res.status(404).json({ error: "Purchase record not found" });
        return;
      }

      if (purchase.status === "completed") {
        res.json({ ok: true, alreadyCaptured: true, tokens: purchase.tokensAmount });
        return;
      }

      if (purchase.userId !== req.user.id) {
        logSecurityEvent(
          req, "billing_user_mismatch", "critical", req.user.id,
          `User ${req.user.id} tried to capture order belonging to ${purchase.userId}`
        );
        res.status(403).json({ error: "Order does not belong to your account" });
        return;
      }

      await db.execute(
        sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
            VALUES (${req.user.id}, ${purchase.tokensAmount}, 0, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET balance = token_balances.balance + ${purchase.tokensAmount}`
      );

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

      const newBalance = updated?.balance ?? purchase.tokensAmount;

      // Send receipt email — fire and forget
      const userInfo = await getUserEmail(req.user.id);
      if (userInfo?.email) {
        sendPaymentReceiptEmail(userInfo.email, {
          purchaseId: purchase.id,
          username: userInfo.username,
          tokensAmount: purchase.tokensAmount,
          amountUsdCents: purchase.amountUsdCents,
          paymentMethod: "paypal",
          transactionId,
          manualReference: null,
          packageLabel: buildPackageLabel(purchase.packageId, purchase.tokensAmount),
          completedAt: new Date(),
          newBalance,
        }).catch(err => console.error("[RECEIPT] PayPal email failed:", err));
      }

      res.json({
        ok: true,
        tokens: purchase.tokensAmount,
        newBalance,
        transactionId,
      });
    } catch (err) {
      console.error("billing capture-order:", err);
      res.status(500).json({ error: "Capture failed" });
    }
  }
);

router.get(
  "/billing/paypal-client-token",
  looseLimit,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const accessToken = await getPayPalToken();
      const response = await fetch(`${payPalBase()}/v1/identity/generate-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("PayPal clientToken error:", err);
        res.status(500).json({ error: "Failed to generate client token" });
        return;
      }

      const data = await response.json() as { client_token: string };
      res.json({ clientToken: data.client_token });
    } catch (err) {
      console.error("client-token route error:", err);
      res.status(500).json({ error: "Server error generating client token" });
    }
  }
);

router.get("/billing/paypal-complete", async (req: Request, res: Response): Promise<void> => {
  const appBase = appBaseUrl();
  const orderId = sanitiseString(req.query.token as string, 100);

  if (!orderId) {
    res.redirect(`${appBase}/?paypal_error=1&reason=no_order`);
    return;
  }

  if (!req.isAuthenticated()) {
    res.redirect(`${appBase}/?paypal_error=1&reason=session_expired`);
    return;
  }

  try {
    const [purchase] = await db
      .select()
      .from(tokenPurchasesTable)
      .where(eq(tokenPurchasesTable.paypalOrderId, orderId));

    if (!purchase) {
      res.redirect(`${appBase}/?paypal_error=1&reason=not_found`);
      return;
    }

    if (purchase.status === "completed") {
      res.redirect(`${appBase}/?paypal_success=1&tokens=${purchase.tokensAmount}`);
      return;
    }

    if (purchase.userId !== req.user.id) {
      logSecurityEvent(
        req, "billing_user_mismatch", "critical", req.user.id,
        `User ${req.user.id} tried to complete order belonging to ${purchase.userId}`
      );
      res.redirect(`${appBase}/?paypal_error=1&reason=mismatch`);
      return;
    }

    const accessToken = await getPayPalToken();
    const captureRes = await fetch(
      `${payPalBase()}/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const capture = await captureRes.json() as {
      status?: string;
      payer?: { email_address?: string };
      purchase_units?: Array<{
        payments?: { captures?: Array<{ id?: string }> };
      }>;
    };

    if (capture.status !== "COMPLETED") {
      console.error("PayPal redirect capture failed:", capture);
      res.redirect(`${appBase}/?paypal_error=1&reason=capture_failed`);
      return;
    }

    const transactionId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
    const payerEmail = capture.payer?.email_address ?? null;

    await db.execute(
      sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
          VALUES (${req.user.id}, ${purchase.tokensAmount}, 0, NOW())
          ON CONFLICT (user_id)
          DO UPDATE SET balance = token_balances.balance + ${purchase.tokensAmount}`
    );

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

    const newBalance = updated?.balance ?? purchase.tokensAmount;

    // Send receipt
    const userInfo = await getUserEmail(req.user.id);
    if (userInfo?.email) {
      sendPaymentReceiptEmail(userInfo.email, {
        purchaseId: purchase.id,
        username: userInfo.username,
        tokensAmount: purchase.tokensAmount,
        amountUsdCents: purchase.amountUsdCents,
        paymentMethod: "paypal",
        transactionId,
        manualReference: null,
        packageLabel: buildPackageLabel(purchase.packageId, purchase.tokensAmount),
        completedAt: new Date(),
        newBalance,
      }).catch(err => console.error("[RECEIPT] PayPal redirect email failed:", err));
    }

    res.redirect(`${appBase}/?paypal_success=1&tokens=${purchase.tokensAmount}`);
  } catch (err) {
    console.error("paypal-complete error:", err);
    res.redirect(`${appBase}/?paypal_error=1&reason=server_error`);
  }
});

router.get(
  "/billing/history",
  looseLimit,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const rows = await db
      .select()
      .from(tokenPurchasesTable)
      .where(eq(tokenPurchasesTable.userId, req.user.id))
      .orderBy(sql`created_at DESC`)
      .limit(20);

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
  }
);

/* ══════════════════════════════════════════════════════════════════════════
   BITCOIN ROUTES
══════════════════════════════════════════════════════════════════════════ */

router.get("/billing/bitcoin-address", looseLimit, (_req: Request, res: Response): void => {
  const address = process.env.BITCOIN_ADDRESS;
  res.json({ configured: !!address, address: address ?? null });
});

router.get(
  "/billing/bitcoin-price",
  moderateLimit,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        { headers: { Accept: "application/json" } }
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
  }
);

router.post(
  "/billing/bitcoin-verify",
  strictPaymentLimit,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Sign in to verify payment" });
      return;
    }

    const address = process.env.BITCOIN_ADDRESS;
    if (!address) {
      res.status(503).json({ error: "Bitcoin payments not configured" });
      return;
    }

    const txHash = sanitiseString(req.body?.txHash, 64);
    const rawPackageId = req.body?.packageId;
    const rawCustomTokens = req.body?.customTokens;

    if (!txHash) {
      res.status(400).json({ error: "Transaction hash required" });
      return;
    }

    if (!BTC_TEST_MODE && !/^[a-fA-F0-9]{64}$/.test(txHash)) {
      res.status(400).json({ error: "Invalid transaction hash" });
      return;
    }

    const packageId = typeof rawPackageId === "string"
      ? rawPackageId.replace(/[^a-z0-9_-]/gi, "").slice(0, 20)
      : undefined;

    const customTokens =
      rawCustomTokens !== undefined && Number.isFinite(Number(rawCustomTokens))
        ? Math.floor(Number(rawCustomTokens))
        : undefined;

    let tokens: number;
    let cents: number;
    let pkgLabel: string;

    if (packageId && packageId !== "custom") {
      const pkg = PACKAGES.find(p => p.id === packageId);
      if (!pkg) { res.status(400).json({ error: "Invalid package" }); return; }
      tokens = pkg.tokens; cents = pkg.cents; pkgLabel = pkg.id;
    } else if (customTokens && customTokens >= 100_000) {
      tokens = customTokens;
      cents = calcCustomPrice(tokens);
      pkgLabel = "custom";
    } else {
      res.status(400).json({ error: "Invalid package or token amount" });
      return;
    }

    if (tokens > 500_000_000) {
      res.status(400).json({ error: "Token amount exceeds maximum per purchase" });
      return;
    }

    const btcKey = `btc_${txHash}`;

    if (BTC_TEST_MODE && txHash.startsWith("test")) {
      const [existingTest] = await db
        .select({ id: tokenPurchasesTable.id })
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.paypalOrderId, btcKey));

      if (existingTest) {
        res.status(409).json({ error: "Test transaction already used." });
        return;
      }

      await db.execute(sql`
        INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
        VALUES (${req.user.id}, ${tokens}, 0, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET balance = token_balances.balance + ${tokens}
      `);

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

      const newBalance = updated?.balance ?? tokens;

      const userInfo = await getUserEmail(req.user.id);
      if (userInfo?.email) {
        sendPaymentReceiptEmail(userInfo.email, {
          purchaseId: 0,
          username: userInfo.username,
          tokensAmount: tokens,
          amountUsdCents: cents,
          paymentMethod: "bitcoin",
          transactionId: txHash,
          manualReference: null,
          packageLabel: buildPackageLabel(pkgLabel, tokens),
          completedAt: new Date(),
          newBalance,
        }).catch(err => console.error("[RECEIPT] BTC test email failed:", err));
      }

      res.json({ ok: true, tokens, newBalance, testMode: true });
      return;
    }

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
        { headers: { Accept: "application/json" } }
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
        res.status(400).json({
          error: "Transaction not found on blockchain. It may not be confirmed yet.",
        });
        return;
      }
      const tx = await txRes.json() as {
        vout: Array<{ scriptpubkey_address?: string; value: number }>;
      };

      const output = tx.vout.find(v => v.scriptpubkey_address === address);
      if (!output) {
        res.status(400).json({
          error: "No payment to the expected Bitcoin address found in this transaction.",
        });
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

      const newBalance = updated?.balance ?? tokens;

      // Send receipt
      const userInfo = await getUserEmail(req.user.id);
      if (userInfo?.email) {
        sendPaymentReceiptEmail(userInfo.email, {
          purchaseId: 0,
          username: userInfo.username,
          tokensAmount: tokens,
          amountUsdCents: cents,
          paymentMethod: "bitcoin",
          transactionId: txHash,
          manualReference: null,
          packageLabel: buildPackageLabel(pkgLabel, tokens),
          completedAt: new Date(),
          newBalance,
        }).catch(err => console.error("[RECEIPT] BTC email failed:", err));
      }

      res.json({ ok: true, tokens, newBalance });
    } catch (err) {
      console.error("bitcoin-verify error:", err);
      res.status(500).json({ error: "Verification failed. Please try again." });
    }
  }
);

/* ══════════════════════════════════════════════════════════════════════════
   PAYPAL WEBHOOK
══════════════════════════════════════════════════════════════════════════ */

router.post("/billing/webhook/paypal", async (req: Request, res: Response): Promise<void> => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    res.sendStatus(200);
    return;
  }

  try {
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

    const event = req.body as {
      event_type?: string;
      resource?: {
        id?: string;
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

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const resource = event.resource ?? {};
      const orderId = resource.supplementary_data?.related_ids?.order_id;

      if (!orderId) {
        console.warn("PayPal webhook: no order_id in capture event");
        res.sendStatus(200);
        return;
      }

      const [purchase] = await db
        .select()
        .from(tokenPurchasesTable)
        .where(eq(tokenPurchasesTable.paypalOrderId, orderId));

      if (!purchase) {
        console.warn("PayPal webhook: no purchase found for order", orderId);
        res.sendStatus(200);
        return;
      }

      if (purchase.status === "completed") {
        res.sendStatus(200);
        return;
      }

      const captureId = resource.id ?? null;
      const payerEmail = resource.payer?.email_address ?? null;

      await db.execute(
        sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
            VALUES (${purchase.userId}, ${purchase.tokensAmount}, 0, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET balance = token_balances.balance + ${purchase.tokensAmount}`
      );

      await db.update(tokenPurchasesTable)
        .set({
          status: "completed",
          paypalTransactionId: captureId,
          paypalPayerEmail: payerEmail,
          completedAt: new Date(),
        })
        .where(eq(tokenPurchasesTable.id, purchase.id));

      const [updated] = await db
        .select({ balance: tokenBalancesTable.balance })
        .from(tokenBalancesTable)
        .where(eq(tokenBalancesTable.userId, purchase.userId));

      const newBalance = updated?.balance ?? purchase.tokensAmount;

      // Webhook receipt — look up user email
      const userInfo = await getUserEmail(purchase.userId);
      if (userInfo?.email) {
        sendPaymentReceiptEmail(userInfo.email, {
          purchaseId: purchase.id,
          username: userInfo.username,
          tokensAmount: purchase.tokensAmount,
          amountUsdCents: purchase.amountUsdCents,
          paymentMethod: "paypal",
          transactionId: captureId,
          manualReference: null,
          packageLabel: buildPackageLabel(purchase.packageId, purchase.tokensAmount),
          completedAt: new Date(),
          newBalance,
        }).catch(err => console.error("[RECEIPT] Webhook email failed:", err));
      }

      console.log(
        `PayPal webhook: credited ${purchase.tokensAmount} tokens to user ${purchase.userId}`
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("PayPal webhook error:", err);
    res.sendStatus(500);
  }
});

export default router;
