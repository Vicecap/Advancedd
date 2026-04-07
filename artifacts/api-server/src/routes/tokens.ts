import { Router, type IRouter, type Request, type Response } from "express";
import { db, tokenBalancesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

export const WEEKLY_ALLOWANCE = 600_000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function getOrCreateBalance(userId: string) {
  const [existing] = await db
    .select()
    .from(tokenBalancesTable)
    .where(eq(tokenBalancesTable.userId, userId));

  if (!existing) {
    const [created] = await db
      .insert(tokenBalancesTable)
      .values({ userId, balance: WEEKLY_ALLOWANCE, lastRefillAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [row] = await db.select().from(tokenBalancesTable).where(eq(tokenBalancesTable.userId, userId));
    return row ?? null;
  }

  const now = Date.now();
  const lastRefill = existing.lastRefillAt.getTime();
  const needsRefill = now - lastRefill >= ONE_WEEK_MS;

  if (needsRefill) {
    const [updated] = await db
      .update(tokenBalancesTable)
      .set({
        // preserve purchased tokens: only top-up if balance is below the weekly allowance
        balance: sql`GREATEST(${tokenBalancesTable.balance}, ${WEEKLY_ALLOWANCE})`,
        lastRefillAt: new Date(),
      })
      .where(eq(tokenBalancesTable.userId, userId))
      .returning();
    return updated;
  }

  return existing;
}

router.get("/tokens/balance", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.json({ authenticated: false, balance: null });
    return;
  }

  const row = await getOrCreateBalance(req.user.id);
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

  const row = await getOrCreateBalance(req.user.id);
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
