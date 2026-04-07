import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, tokenBalancesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createSession,
  clearSession,
  getSessionId,
  setSessionCookie,
  provisionUser,
  type AuthUser,
} from "../lib/auth";
import { sendVerificationEmail } from "../lib/email";
import { logSecurityEvent } from "../lib/security";

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.get("/auth/user", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.json({ user: null }); return; }
  // Always read isPremium fresh from DB so premium changes take effect without re-login
  try {
    const [row] = await db.select({ isPremium: usersTable.isPremium }).from(usersTable).where(eq(usersTable.id, req.user.id));
    res.json({ user: { ...req.user, isPremium: row?.isPremium ?? req.user.isPremium ?? false } });
  } catch {
    res.json({ user: req.user });
  }
});

/* ── POST /auth/register — create account, send verification code ── */
router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const { email, password, firstName, lastName } = req.body as {
    email?: string; password?: string; firstName?: string; lastName?: string;
  };

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }

  const normalEmail = email.trim().toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalEmail));
  if (existing && existing.emailVerified) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const code = generateCode();
  const expiry = new Date(Date.now() + 15 * 60 * 1000);

  if (existing && !existing.emailVerified) {
    await db.update(usersTable)
      .set({ passwordHash, firstName: firstName?.trim() ?? null, lastName: lastName?.trim() ?? null, verificationCode: code, verificationCodeExpiry: expiry })
      .where(eq(usersTable.email, normalEmail));
  } else {
    const [newUser] = await db.insert(usersTable).values({
      email: normalEmail,
      firstName: firstName?.trim() ?? null,
      lastName: lastName?.trim() ?? null,
      passwordHash,
      authProvider: "email",
      emailVerified: false,
      verificationCode: code,
      verificationCodeExpiry: expiry,
    }).returning({ id: usersTable.id });
    await db.insert(tokenBalancesTable).values({ userId: newUser.id, balance: 600_000 }).onConflictDoNothing();
  }

  const emailSent = await sendVerificationEmail(normalEmail, code);
  const showCode = !emailSent;
  res.status(202).json({
    needsVerification: true,
    email: normalEmail,
    ...(showCode ? { devCode: code } : {}),
  });
});

/* ── POST /auth/verify-email — verify 6-digit code ── */
router.post("/auth/verify-email", async (req: Request, res: Response): Promise<void> => {
  const { email, code, refCode } = req.body as { email?: string; code?: string; refCode?: string };
  if (!email || !code) {
    res.status(400).json({ error: "Email and code are required." });
    return;
  }

  const normalEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalEmail));

  if (!user) {
    res.status(404).json({ error: "No pending verification for this email." });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ error: "Email is already verified." });
    return;
  }
  if (!user.verificationCode || user.verificationCode !== code.trim()) {
    res.status(400).json({ error: "Incorrect verification code." });
    return;
  }
  if (!user.verificationCodeExpiry || user.verificationCodeExpiry < new Date()) {
    res.status(400).json({ error: "Verification code has expired. Please register again." });
    return;
  }

  await db.update(usersTable)
    .set({ emailVerified: true, verificationCode: null, verificationCodeExpiry: null })
    .where(eq(usersTable.email, normalEmail));

  // Award referral bonus to the referrer
  if (refCode?.trim()) {
    try {
      const { awardReferralBonus } = await import("./referral");
      await awardReferralBonus(user.id, refCode.trim());
    } catch { /* silent — referral errors must not break login */ }
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    profileImageUrl: user.profileImageUrl ?? null,
    authProvider: user.authProvider,
    isAdmin: user.isAdmin ?? false,
    isPremium: user.isPremium ?? false,
    emailVerified: true,
  };

  const sid = await createSession({ user: authUser });
  setSessionCookie(res, sid);
  res.status(200).json({ user: authUser });
});

/* ── POST /auth/resend-verification — resend code (5-min cooldown, max 5 times) ── */
router.post("/auth/resend-verification", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: "Email required." }); return; }

  const normalEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalEmail));
  if (!user || user.emailVerified) {
    res.status(400).json({ error: "No pending verification for this email." });
    return;
  }

  const MAX_RESENDS = 5;
  const COOLDOWN_MS = 5 * 60 * 1000;

  const resendCount = user.verificationResendCount ?? 0;
  if (resendCount >= MAX_RESENDS) {
    res.status(429).json({ error: "Maximum resend attempts reached. Please register again.", maxReached: true });
    return;
  }

  const lastResent = user.verificationResendLastAt;
  if (lastResent) {
    const elapsed = Date.now() - new Date(lastResent).getTime();
    if (elapsed < COOLDOWN_MS) {
      const waitSecs = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      res.status(429).json({ error: `Please wait ${waitSecs} seconds before requesting a new code.`, waitSeconds: waitSecs });
      return;
    }
  }

  const code = generateCode();
  const expiry = new Date(Date.now() + 15 * 60 * 1000);
  await db.update(usersTable)
    .set({
      verificationCode: code,
      verificationCodeExpiry: expiry,
      verificationResendCount: resendCount + 1,
      verificationResendLastAt: new Date(),
    })
    .where(eq(usersTable.email, normalEmail));

  await sendVerificationEmail(normalEmail, code);
  const emailConfigured2 = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
  res.json({ ok: true, attemptsLeft: MAX_RESENDS - (resendCount + 1), ...(!emailConfigured2 ? { devCode: code } : {}) });
});

/* ── POST /auth/login ── */
router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const normalEmail = email.trim().toLowerCase();
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.email, normalEmail));

  if (!dbUser) {
    logSecurityEvent(req, "failed_login_unknown_email", "medium", null,
      `Login attempt with unknown email: ${normalEmail}`, { email: normalEmail });
    res.status(401).json({ error: "No account found with this email." });
    return;
  }
  if (!dbUser.passwordHash) {
    logSecurityEvent(req, "failed_login_wrong_provider", "low", dbUser.id,
      `Email login attempted on Google account: ${normalEmail}`);
    res.status(401).json({ error: "This account uses Google sign-in. Please continue with Google." });
    return;
  }
  if (!dbUser.emailVerified) {
    const code = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);
    await db.update(usersTable)
      .set({ verificationCode: code, verificationCodeExpiry: expiry })
      .where(eq(usersTable.email, normalEmail));
    await sendVerificationEmail(normalEmail, code);
    const emailConfigured3 = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
    res.status(403).json({ error: "Email not verified. A new code has been sent.", needsVerification: true, email: normalEmail, ...(!emailConfigured3 ? { devCode: code } : {}) });
    return;
  }

  const valid = await bcrypt.compare(password, dbUser.passwordHash);
  if (!valid) {
    logSecurityEvent(req, "failed_login_wrong_password", "medium", dbUser.id,
      `Wrong password for: ${normalEmail}`);
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  const user: AuthUser = {
    id: dbUser.id,
    email: dbUser.email ?? null,
    firstName: dbUser.firstName ?? null,
    lastName: dbUser.lastName ?? null,
    profileImageUrl: dbUser.profileImageUrl ?? null,
    authProvider: dbUser.authProvider,
    isAdmin: dbUser.isAdmin ?? false,
    isPremium: dbUser.isPremium ?? false,
    emailVerified: dbUser.emailVerified ?? false,
  };

  const sid = await createSession({ user });
  setSessionCookie(res, sid);
  res.json({ user });
});

/* ── POST /auth/logout ── */
router.post("/auth/logout", async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

const pendingGoogleStates = new Map<string, number>();

function getGoogleRedirectUri(req: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const origin = getOrigin(req);
  return `${origin}/api/auth/google/callback`;
}

router.get("/auth/google", (req: Request, res: Response): void => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Google sign-in is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    return;
  }

  const redirectUri = getGoogleRedirectUri(req);
  const state = crypto.randomBytes(16).toString("hex");

  pendingGoogleStates.set(state, Date.now() + 10 * 60 * 1000);
  setTimeout(() => pendingGoogleStates.delete(state), 10 * 60 * 1000);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  res.cookie("google_state", state, { httpOnly: true, maxAge: 600_000, sameSite: "lax", secure: false, path: "/" });
  res.redirect(url.toString());
});

router.get("/auth/google/callback", async (req: Request, res: Response): Promise<void> => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect("/?auth_error=google_not_configured");
    return;
  }

  const { code, state, error } = req.query as Record<string, string>;
  const cookieState = req.cookies?.google_state;
  res.clearCookie("google_state", { path: "/" });

  if (error || !code) { res.redirect("/?auth_error=google_denied"); return; }

  const stateExpiry = pendingGoogleStates.get(state);
  const cookieStateExpiry = cookieState ? pendingGoogleStates.get(cookieState) : undefined;
  const now = Date.now();

  const stateValid = (stateExpiry && stateExpiry > now) || (cookieState === state) || (cookieStateExpiry && cookieStateExpiry > now);
  if (state) pendingGoogleStates.delete(state);
  if (cookieState) pendingGoogleStates.delete(cookieState);

  if (!stateValid) {
    res.redirect("/?auth_error=google_state_mismatch");
    return;
  }

  const redirectUri = getGoogleRedirectUri(req);

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokens = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
    if (!tokens.access_token) throw new Error(tokens.error_description ?? tokens.error ?? "No access token");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileRes.json() as { sub: string; email: string; given_name?: string; family_name?: string; picture?: string };

    if (!profile.email) throw new Error("Google did not return an email address");

    const user = await provisionUser({
      email: profile.email,
      firstName: profile.given_name ?? null,
      lastName: profile.family_name ?? null,
      profileImageUrl: profile.picture ?? null,
      googleId: profile.sub,
      authProvider: "google",
    });

    await db.update(usersTable).set({ emailVerified: true }).where(eq(usersTable.email, profile.email));

    const sid = await createSession({ user: { ...user, emailVerified: true, isPremium: user.isPremium } });
    setSessionCookie(res, sid);
    res.redirect("/");
  } catch (err) {
    req.log.error({ err }, "Google OAuth callback error");
    res.redirect(`/?auth_error=google_failed&detail=${encodeURIComponent((err as Error).message ?? "unknown")}`);
  }
});

/* ── POST /auth/forgot-password ─────────────────────────────────────────── */
router.post("/auth/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) { res.status(400).json({ error: "Email is required." }); return; }
  const normalEmail = email.trim().toLowerCase();
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalEmail));
    if (!user || !user.passwordHash) {
      res.json({ ok: true, message: "If that email exists, a reset code has been sent." }); return;
    }
    const code = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);
    await db.update(usersTable).set({ resetCode: code, resetCodeExpiry: expiry }).where(eq(usersTable.email, normalEmail));
    let devCode: string | undefined;
    try { await sendVerificationEmail(normalEmail, code); }
    catch { devCode = code; }
    res.json({ ok: true, devCode, message: "Reset code sent." });
  } catch { res.status(500).json({ error: "Failed to send reset code." }); }
});

/* ── POST /auth/reset-password ──────────────────────────────────────────── */
router.post("/auth/reset-password", async (req: Request, res: Response): Promise<void> => {
  const { email, code, password } = req.body as { email?: string; code?: string; password?: string };
  if (!email?.trim() || !code || !password) {
    res.status(400).json({ error: "Email, code, and new password are required." }); return;
  }
  if (password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters." }); return; }
  const normalEmail = email.trim().toLowerCase();
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalEmail));
    if (!user || !user.resetCode || !user.resetCodeExpiry) {
      res.status(400).json({ error: "No reset code found. Please request a new one." }); return;
    }
    if (user.resetCode !== code.trim()) { res.status(400).json({ error: "Incorrect reset code." }); return; }
    if (new Date(user.resetCodeExpiry) < new Date()) {
      res.status(400).json({ error: "Reset code has expired. Please request a new one." }); return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(usersTable).set({ passwordHash, resetCode: null, resetCodeExpiry: null }).where(eq(usersTable.email, normalEmail));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Failed to reset password." }); }
});

export default router;
