import { Router, type IRouter, type Request, type Response } from "express";
import { db, tokenBalancesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { AUTH_WEEKLY_ALLOWANCE as WEEKLY_ALLOWANCE, getOrCreateUserBalance } from "../lib/tokens";

const router: IRouter = Router();

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

router.get("/tokens/balance", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.json({ authenticated: false, balance: null });
    return;
  }

  const row = await getOrCreateUserBalance(req.user.id);
  if (!row) {
    res.json({ authenticated: true, balance: WEEKLY_ALLOWANCE, totalUsed: 0, weeklyAllowance: WEEKLY_ALLOWANCE });
    return;
  }

  const nextRefillAt = new Date(row.lastRefillAt.getTime() + ONE_WEEK_MS);
  res.json({
    authenticated: true,
    balance: row.balance,
    totalUsed: row.totalUsed,
    nextRefillAt: nextRefillAt.toISOString(),
    weeklyAllowance: WEEKLY_ALLOWANCE,
    xp: row.xp ?? 0,
    xpTotal: row.xpTotal ?? 0,
  });
});

router.post("/tokens/use", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.json({ authenticated: false, deducted: false });
    return;
  }

  const body = req.body as { cost?: number };
  const cost = typeof body.cost === "number" && body.cost > 0 ? Math.min(body.cost, 500_000) : 10_000;

  const row = await getOrCreateUserBalance(req.user.id);
  if (!row) {
    res.json({ authenticated: true, deducted: false, balance: 0 });
    return;
  }

  if (row.balance < cost) {
    res.status(402).json({ error: "Insufficient tokens. Refill happens weekly.", balance: row.balance });
    return;
  }

  const [updated] = await db
    .update(tokenBalancesTable)
    .set({
      balance: sql`${tokenBalancesTable.balance} - ${cost}`,
      totalUsed: sql`${tokenBalancesTable.totalUsed} + ${cost}`,
    })
    .where(eq(tokenBalancesTable.userId, req.user.id))
    .returning();

  res.json({ authenticated: true, deducted: true, balance: updated.balance, totalUsed: updated.totalUsed });
});

export default router;
