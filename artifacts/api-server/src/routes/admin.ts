import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, usersTable, tokenBalancesTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { createSession, setSessionCookie, type AuthUser } from "../lib/auth";
import { sendAdminWelcomeEmail } from "../lib/email";

const router: IRouter = Router();

function getAdminToken(): string | null {
  return process.env.ADMIN_INIT_TOKEN || null;
}
function safeTokenEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/* ── GET /admin/setup/status — check if any admin exists ── */
router.get("/admin/setup/status", async (_req: Request, res: Response): Promise<void> => {
  const [{ total }] = await db.select({ total: count() }).from(usersTable).where(eq(usersTable.isAdmin, true));
  res.json({ hasAdmin: total > 0, tokenRequired: !!getAdminToken(), setupEnabled: !!getAdminToken() });
});

/* ── POST /admin/setup — create first admin (only if no admins exist) ── */
router.post("/admin/setup", async (req: Request, res: Response): Promise<void> => {
  const { email, password, firstName, lastName, setupToken } = req.body as {
    email?: string; password?: string; firstName?: string; lastName?: string; setupToken?: string;
  };

  const configuredToken = getAdminToken();
  if (!configuredToken || !setupToken || !safeTokenEqual(setupToken, configuredToken)) {
    res.status(403).json({ error: "Invalid setup token." });
    return;
  }

  const [{ total }] = await db.select({ total: count() }).from(usersTable).where(eq(usersTable.isAdmin, true));
  if (total > 0) {
    res.status(409).json({ error: "An admin account already exists. Use the admin dashboard to manage admins." });
    return;
  }

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Admin password must be at least 8 characters." });
    return;
  }

  const normalEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalEmail));
  let userId: string;

  if (existing) {
    await db.update(usersTable)
      .set({ passwordHash, isAdmin: true, emailVerified: true, firstName: firstName?.trim() ?? existing.firstName, lastName: lastName?.trim() ?? existing.lastName })
      .where(eq(usersTable.email, normalEmail));
    userId = existing.id;
  } else {
    const [saved] = await db.insert(usersTable).values({
      email: normalEmail,
      firstName: firstName?.trim() ?? null,
      lastName: lastName?.trim() ?? null,
      passwordHash,
      authProvider: "email",
      isAdmin: true,
      emailVerified: true,
    }).returning();
    userId = saved.id;
    await db.insert(tokenBalancesTable).values({ userId }).onConflictDoNothing();
  }

  const [saved] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  const authUser: AuthUser = {
    id: saved.id,
    email: saved.email ?? null,
    firstName: saved.firstName ?? null,
    lastName: saved.lastName ?? null,
    profileImageUrl: saved.profileImageUrl ?? null,
    authProvider: saved.authProvider,
    isAdmin: true,
    isPremium: saved.isPremium ?? false,
    emailVerified: true,
  };

  const sid = await createSession({ user: authUser });
  setSessionCookie(res, sid);
  res.status(201).json({ user: authUser });
});

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required." });
    return false;
  }
  return true;
}

/* ── POST /admin/promote — make a user admin ── */
router.post("/admin/promote", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const { userId, email } = req.body as { userId?: string; email?: string };

  let target;
  if (userId) {
    [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  } else if (email) {
    [target] = await db.select().from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase()));
  }

  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.isAdmin) { res.json({ ok: true, message: "User is already an admin." }); return; }

  await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, target.id));
  res.json({ ok: true, user: { id: target.id, email: target.email, firstName: target.firstName, lastName: target.lastName } });
});

/* ── POST /admin/users/:id/premium — toggle premium status ── */
router.post("/admin/users/:id/premium", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { premium } = req.body as { premium?: boolean };
  if (typeof premium !== "boolean") { res.status(400).json({ error: "premium (boolean) is required." }); return; }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found." }); return; }

  await db.update(usersTable).set({ isPremium: premium }).where(eq(usersTable.id, id));
  res.json({ ok: true, userId: id, isPremium: premium });
});

/* ── POST /admin/demote — remove admin from a user ── */
router.post("/admin/demote", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required." }); return; }
  if (userId === req.user!.id) { res.status(400).json({ error: "You cannot remove your own admin status." }); return; }

  await db.update(usersTable).set({ isAdmin: false }).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

/* ── POST /admin/users/reset-tokens — reset a user's token balance to weekly allowance ── */
router.post("/admin/users/reset-tokens", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required." }); return; }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!target) { res.status(404).json({ error: "User not found." }); return; }

  const WEEKLY = 60_000;
  await db.execute(
    sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
        VALUES (${userId}, ${WEEKLY}, 0, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET balance = ${WEEKLY}, last_refill_at = NOW()`
  );

  const [updated] = await db.select({ balance: tokenBalancesTable.balance })
    .from(tokenBalancesTable).where(eq(tokenBalancesTable.userId, userId));

  res.json({ ok: true, userId, newBalance: updated?.balance ?? WEEKLY });
});

/* ── POST /admin/create-admin — create a new admin account ── */
router.post("/admin/create-admin", async (req: Request, res: Response): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const { email, firstName, lastName } = req.body as { email?: string; firstName?: string; lastName?: string };
  if (!email?.trim()) { res.status(400).json({ error: "Email is required." }); return; }

  const normalEmail = email.trim().toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalEmail));
  if (existing?.isAdmin) { res.status(409).json({ error: "This user is already an admin." }); return; }

  const temporaryPassword = crypto.randomBytes(12).toString("base64url") + "!1";
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  let userId: string;
  if (existing) {
    await db.update(usersTable).set({ isAdmin: true, emailVerified: true, passwordHash }).where(eq(usersTable.id, existing.id));
    userId = existing.id;
  } else {
    const [saved] = await db.insert(usersTable).values({
      email: normalEmail,
      firstName: firstName?.trim() ?? null,
      lastName: lastName?.trim() ?? null,
      passwordHash,
      authProvider: "email",
      isAdmin: true,
      emailVerified: true,
    }).returning();
    userId = saved.id;
    await db.insert(tokenBalancesTable).values({ userId }).onConflictDoNothing();
  }

  await sendAdminWelcomeEmail(normalEmail, temporaryPassword);
  res.status(201).json({ ok: true, email: normalEmail });
});

export default router;
