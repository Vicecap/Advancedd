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

const ADMIN_NOTIFY = process.env.ADMIN_EMAIL ?? process.env.EMAIL_USER ?? "";

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

export async function sendAdminWelcomeEmail(to: string, tempPassword: string): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[EMAIL] Admin credentials for ${to}: password=${tempPassword}`);
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
            <p style="margin:4px 0;font-size:14px;color:#e5e7eb;"><strong>Temporary password:</strong> <code style="color:#f87171;">${tempPassword}</code></p>
          </div>
          <p style="color:#6b7280;font-size:12px;">Please change your password after first login.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[EMAIL] Failed to send admin welcome email:", err);
  }
}
