import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const portEnv = process.env.EMAIL_PORT;

  if (!host || !user || !pass) return null;

  const isGmail = host.includes("gmail.com");
  const port = portEnv ? Number(portEnv) : isGmail ? 465 : 587;
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

const FROM = process.env.EMAIL_FROM ?? "Zimsolve <noreply@zimsolve.app>";
const ADMIN_NOTIFY = process.env.ADMIN_EMAIL ?? process.env.EMAIL_USER ?? "";

/* ── Receipt email ──────────────────────────────────────────────────────── */
export async function sendPaymentReceiptEmail(to: string, receipt: {
  purchaseId: number;
  username?: string | null;
  tokensAmount: number;
  amountUsdCents: number;
  paymentMethod: string;
  transactionId?: string | null;
  manualReference?: string | null;
  packageLabel: string;
  completedAt: Date;
  newBalance: number;
}): Promise<boolean> {
  const transport = createTransport();

  const usd = (receipt.amountUsdCents / 100).toFixed(2);
  const tokens = receipt.tokensAmount.toLocaleString();
  const newBal = receipt.newBalance.toLocaleString();
  const date = receipt.completedAt.toUTCString();
  const methodLabel: Record<string, string> = {
    paypal: "PayPal",
    ecocash: "EcoCash",
    ecocash_diaspora: "EcoCash Diaspora",
    bank: "Bank Transfer",
    bitcoin: "Bitcoin",
    manual: "Admin Grant",
  };
  const method = methodLabel[receipt.paymentMethod] ?? receipt.paymentMethod;

  if (!transport) {
    console.log(
      `[EMAIL] Receipt for ${to}: ${tokens} tokens — $${usd} via ${method} ` +
      `(Ref: ${receipt.transactionId ?? receipt.manualReference ?? "N/A"})`
    );
    return false;
  }

  try {
    await transport.sendMail({
      from: FROM,
      to,
      subject: `Receipt — ${tokens} Tokens Purchased — Zimsolve`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;
                    background:#0f1117;color:#e5e7eb;border-radius:16px;">

          <div style="text-align:center;margin-bottom:28px;">
            <span style="font-size:48px;">🧮</span>
            <h1 style="color:#34d399;margin:8px 0 4px;font-size:22px;">Payment Successful!</h1>
            <p style="color:#9ca3af;margin:0;font-size:14px;">
              Your token balance has been credited. Here's your receipt.
            </p>
          </div>

          <!-- Receipt box -->
          <div style="background:#1a1d2e;border:2px solid rgba(52,211,153,0.35);
                      border-radius:12px;padding:24px;margin-bottom:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%;">Receipt #</td>
                <td style="color:#e5e7eb;font-size:13px;font-weight:bold;">#${receipt.purchaseId}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Date</td>
                <td style="color:#e5e7eb;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">${date}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Package</td>
                <td style="color:#e5e7eb;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">${receipt.packageLabel}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Tokens</td>
                <td style="color:#a5b4fc;font-size:15px;font-weight:bold;
                           border-top:1px solid rgba(255,255,255,0.06);">+${tokens}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Amount Paid</td>
                <td style="color:#34d399;font-size:15px;font-weight:bold;
                           border-top:1px solid rgba(255,255,255,0.06);">$${usd} USD</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Payment Method</td>
                <td style="color:#e5e7eb;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">${method}</td>
              </tr>
              ${receipt.transactionId ? `
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Transaction ID</td>
                <td style="color:#e5e7eb;font-size:12px;font-family:monospace;word-break:break-all;
                           border-top:1px solid rgba(255,255,255,0.06);">${receipt.transactionId}</td>
              </tr>` : ""}
              ${receipt.manualReference ? `
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Reference</td>
                <td style="color:#e5e7eb;font-size:13px;font-family:monospace;
                           border-top:1px solid rgba(255,255,255,0.06);">${receipt.manualReference}</td>
              </tr>` : ""}
            </table>
          </div>

          <!-- New balance -->
          <div style="background:rgba(165,180,252,0.08);border:1px solid rgba(165,180,252,0.25);
                      border-radius:10px;padding:16px;text-align:center;margin-bottom:24px;">
            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">Your New Token Balance</p>
            <p style="margin:0;color:#a5b4fc;font-size:26px;font-weight:bold;
                      font-family:monospace;">${newBal}</p>
          </div>

          <p style="color:#4b5563;font-size:11px;text-align:center;">
            Thank you for using Zimsolve AI. If you did not make this purchase,
            please contact support immediately.
          </p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[EMAIL] Failed to send receipt email:", err);
    return false;
  }
}

/* ── Admin alert: manual payment approved/rejected ──────────────────────── */
export async function sendManualPaymentStatusEmail(to: string, info: {
  status: "approved" | "rejected";
  purchaseId: number;
  tokensAmount: number;
  amountUsdCents: number;
  manualReference: string;
  paymentMethod: string;
  adminNote?: string | null;
  newBalance?: number;
}): Promise<void> {
  const transport = createTransport();
  const usd = (info.amountUsdCents / 100).toFixed(2);
  const tokens = info.tokensAmount.toLocaleString();
  const isApproved = info.status === "approved";

  if (!transport) {
    console.log(`[EMAIL] Manual payment ${info.status} for ${to} — ${tokens} tokens`);
    return;
  }

  try {
    await transport.sendMail({
      from: FROM,
      to,
      subject: isApproved
        ? `✅ Payment Approved — ${tokens} Tokens Credited — Zimsolve`
        : `❌ Payment Could Not Be Verified — Zimsolve`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;
                    background:#0f1117;color:#e5e7eb;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:44px;">${isApproved ? "✅" : "❌"}</span>
            <h1 style="color:${isApproved ? "#34d399" : "#f87171"};margin:8px 0 4px;font-size:20px;">
              ${isApproved ? "Payment Approved!" : "Payment Not Verified"}
            </h1>
          </div>
          <div style="background:#1a1d2e;border:2px solid ${isApproved ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)"};
                      border-radius:12px;padding:20px;margin-bottom:20px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:7px 0;color:#6b7280;font-size:13px;width:40%;">Reference</td>
                <td style="color:#e5e7eb;font-size:13px;font-family:monospace;">${info.manualReference}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Tokens</td>
                <td style="color:#a5b4fc;font-size:14px;font-weight:bold;
                           border-top:1px solid rgba(255,255,255,0.06);">${isApproved ? "+" : ""}${tokens}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Amount</td>
                <td style="color:#e5e7eb;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">$${usd} USD</td>
              </tr>
              ${info.adminNote ? `
              <tr>
                <td style="padding:7px 0;color:#6b7280;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">Note</td>
                <td style="color:#e5e7eb;font-size:13px;
                           border-top:1px solid rgba(255,255,255,0.06);">${info.adminNote}</td>
              </tr>` : ""}
            </table>
          </div>
          ${isApproved && info.newBalance !== undefined ? `
          <div style="background:rgba(165,180,252,0.08);border:1px solid rgba(165,180,252,0.25);
                      border-radius:10px;padding:14px;text-align:center;margin-bottom:20px;">
            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">New Token Balance</p>
            <p style="margin:0;color:#a5b4fc;font-size:24px;font-weight:bold;font-family:monospace;">
              ${info.newBalance.toLocaleString()}
            </p>
          </div>` : ""}
          ${!isApproved ? `
          <p style="color:#9ca3af;font-size:13px;">
            Your payment could not be verified. Please contact support with your 
            reference code <strong style="color:#e5e7eb;">${info.manualReference}</strong> 
            if you believe this is an error.
          </p>` : ""}
          <p style="color:#4b5563;font-size:11px;text-align:center;margin-top:16px;">
            Zimsolve AI — If you have questions, contact support through the app.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[EMAIL] Failed to send payment status email:", err);
  }
}

/* ── Existing functions below (unchanged) ───────────────────────────────── */

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[EMAIL] No SMTP configured — verification code for ${to}: ${code}`);
    return false;
  }
  try {
    await transport.sendMail({
      from: FROM,
      to,
      subject: "Verify your Zimsolve account",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f1117;color:#e5e7eb;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:48px;">🧮</span>
            <h1 style="color:#a5b4fc;margin:8px 0 4px;font-size:22px;">Verify your email</h1>
            <p style="color:#9ca3af;margin:0;font-size:14px;">Enter this code to complete your Zimsolve registration</p>
          </div>
          <div style="background:#1a1d2e;border:2px solid rgba(99,102,241,0.4);border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
            <div style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#a5b4fc;font-family:monospace;">${code}</div>
          </div>
          <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:16px;">This code expires in 15 minutes. If you didn't create an account, you can ignore this email.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[EMAIL] Failed to send verification email:", err);
    return false;
  }
}

export async function sendSupportTicketNotification(ticket: {
  id: number; name: string | null; email: string; subject: string;
  category: string; priority: string; directedTo: string; message: string;
}): Promise<void> {
  const transport = createTransport();
  if (!transport || !ADMIN_NOTIFY) {
    console.log(`[EMAIL] New support ticket #${ticket.id} from ${ticket.email}: ${ticket.subject}`);
    return;
  }
  const priorityColor = { urgent: "#f87171", high: "#fb923c", medium: "#fbbf24", low: "#6b7280" }[ticket.priority] ?? "#6b7280";
  try {
    await transport.sendMail({
      from: FROM, to: ADMIN_NOTIFY,
      subject: `[Support #${ticket.id}] ${ticket.subject} [${ticket.priority.toUpperCase()}]`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0f1117;color:#e5e7eb;border-radius:16px;">
          <h1 style="color:#a5b4fc;font-size:18px;margin-bottom:4px;">New Support Ticket #${ticket.id}</h1>
          <p style="color:#9ca3af;font-size:13px;margin-bottom:20px;">Received from a user — requires your attention</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:110px;">From</td><td style="color:#e5e7eb;font-size:13px;">${ticket.name ?? ""} &lt;${ticket.email}&gt;</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Category</td><td style="color:#e5e7eb;font-size:13px;">${ticket.category}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Directed To</td><td style="color:#e5e7eb;font-size:13px;">${ticket.directedTo}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Priority</td><td style="font-size:13px;font-weight:bold;color:${priorityColor};">${ticket.priority.toUpperCase()}</td></tr>
          </table>
          <div style="background:#1a1d2e;border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:18px;">
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">Message</p>
            <p style="color:#e5e7eb;font-size:14px;white-space:pre-wrap;margin:0;">${ticket.message}</p>
          </div>
          <p style="color:#4b5563;font-size:11px;margin-top:16px;">Reply to ticket in the Admin Dashboard → Support tab</p>
        </div>
      `,
    });
  } catch (err) { console.error("[EMAIL] Failed to send support notification:", err); }
}

export async function sendSupportTicketReply(to: string, ticket: {
  id: number; subject: string; adminResponse: string; respondedBy: string;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[EMAIL] Support reply for ticket #${ticket.id} to ${to}: ${ticket.adminResponse}`);
    return;
  }
  try {
    await transport.sendMail({
      from: FROM, to,
      subject: `Re: Your support request #${ticket.id} — ${ticket.subject}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0f1117;color:#e5e7eb;border-radius:16px;">
          <h1 style="color:#34d399;font-size:18px;margin-bottom:4px;">We've replied to your request</h1>
          <p style="color:#9ca3af;font-size:13px;margin-bottom:20px;">Ticket #${ticket.id} — ${ticket.subject}</p>
          <div style="background:#1a1d2e;border:1px solid rgba(52,211,153,0.3);border-radius:12px;padding:18px;margin-bottom:20px;">
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">Response from ${ticket.respondedBy}</p>
            <p style="color:#e5e7eb;font-size:14px;white-space:pre-wrap;margin:0;">${ticket.adminResponse}</p>
          </div>
          <p style="color:#4b5563;font-size:11px;">If you need further assistance, please submit another support request through the app.</p>
        </div>
      `,
    });
  } catch (err) { console.error("[EMAIL] Failed to send support reply:", err); }
}

export async function sendAdminWelcomeEmail(to: string, temporaryPassword: string): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[EMAIL] Admin credentials for ${to}: password=${temporaryPassword}`);
    return;
  }
  try {
    await transport.sendMail({
      from: FROM,
      to,
      subject: "Your Zimsolve admin account",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f1117;color:#e5e7eb;border-radius:16px;">
          <h1 style="color:#f87171;font-size:20px;margin-bottom:8px;">Admin Account Created</h1>
          <p style="color:#9ca3af;font-size:14px;">Your Zimsolve admin account has been set up.</p>
          <div style="background:#1a1d2e;border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:20px;margin:20px 0;">
            <p style="margin:4px 0;font-size:14px;color:#e5e7eb;"><strong>Email:</strong> ${to}</p>
            <p style="margin:4px 0;font-size:14px;color:#e5e7eb;"><strong>Temporary password:</strong> <code style="color:#f87171;">${temporaryPassword}</code></p>
          </div>
          <p style="color:#6b7280;font-size:12px;">Please change your password after first login.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[EMAIL] Failed to send admin welcome email:", err);
  }
}

export async function sendAdminBroadcastEmail(to: string, subject: string, body: string): Promise<boolean> {
  const transport = createTransport();
  if (!transport) {
    console.warn("[EMAIL] Admin broadcast skipped: email transport not configured");
    return false;
  }
  try {
    await transport.sendMail({
      from: FROM,
      to,
      subject,
      text: body,
      html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;line-height:1.55;color:#111827;white-space:pre-wrap;">${body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</div>`,
    });
    return true;
  } catch (err) {
    console.error("[EMAIL] Failed admin broadcast:", err);
    return false;
  }
}
