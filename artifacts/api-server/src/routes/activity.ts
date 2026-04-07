import { Router, type IRouter } from "express";
import { db, activityLog, usersTable, tokenBalancesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

/* ── POST /activity — log an activity and optionally award XP ── */
router.post("/activity", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  const userId = (req.user as { id: number }).id;
  const { type, description, xpEarned = 0, tokensUsed = 0 } = req.body as {
    type: string; description: string; xpEarned?: number; tokensUsed?: number;
  };
  if (!type || !description) {
    res.status(400).json({ error: "type and description required" });
    return;
  }
  const xp = Math.min(Math.max(0, Number(xpEarned) || 0), 500);
  const tok = Math.max(0, Number(tokensUsed) || 0);

  await db.insert(activityLog).values({ userId, type, description, xpEarned: xp, tokensUsed: tok });

  if (xp > 0) {
    await db.execute(
      sql`INSERT INTO token_balances (user_id, xp, xp_total, balance)
          VALUES (${userId}, ${xp}, ${xp}, 0)
          ON CONFLICT (user_id)
          DO UPDATE SET xp = token_balances.xp + ${xp}, xp_total = token_balances.xp_total + ${xp}`
    );
  }
  res.json({ ok: true });
});

/* ── GET /activity — get current user's activity history ── */
router.get("/activity", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  const userId = (req.user as { id: number }).id;
  const rows = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.userId, userId))
    .orderBy(desc(activityLog.createdAt))
    .limit(100);
  res.json({ activities: rows });
});

/* ── DELETE /auth/account — permanently delete current user's account ── */
router.delete("/auth/account", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  const userId = (req.user as { id: number }).id;
  try {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  } catch {
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
