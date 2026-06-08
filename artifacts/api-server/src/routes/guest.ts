import { Router } from "express";
import { db } from "@workspace/db";
import { anonymousTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getGuestId } from "../lib/tokens";
import { redisRateLimit } from "../lib/rate-limiter";

const router = Router();
const guestLimit = redisRateLimit({ windowSecs: 60, max: 30, keyPrefix: "rl:guest", message: "Too many guest token requests." });

const WEEKLY_ALLOWANCE = 20_000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function getOrCreateRecord(deviceId: string) {
  const [existing] = await db
    .select()
    .from(anonymousTokensTable)
    .where(eq(anonymousTokensTable.deviceId, deviceId));

  if (!existing) {
    const [created] = await db
      .insert(anonymousTokensTable)
      .values({ deviceId, balance: WEEKLY_ALLOWANCE, lastRefillAt: new Date() })
      .returning();
    return created;
  }

  const now = Date.now();
  const refillAge = now - existing.lastRefillAt.getTime();
  if (refillAge >= ONE_WEEK_MS) {
    const [refreshed] = await db
      .update(anonymousTokensTable)
      .set({ balance: WEEKLY_ALLOWANCE, lastRefillAt: new Date() })
      .where(eq(anonymousTokensTable.deviceId, deviceId))
      .returning();
    return refreshed;
  }

  return existing;
}

router.get("/guest/balance", guestLimit, async (req, res) => {
  const deviceId = getGuestId(req);
  try {
    const record = await getOrCreateRecord(deviceId);
    const resetAt = record.lastRefillAt.getTime() + ONE_WEEK_MS;
    return res.json({ balance: record.balance, weeklyAllowance: WEEKLY_ALLOWANCE, resetAt });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch guest balance" });
  }
});

router.post("/guest/deduct", guestLimit, async (req, res) => {
  const { amount = 10_000 } = req.body as { amount?: number };
  const deviceId = getGuestId(req);
  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }
  try {
    const record = await getOrCreateRecord(deviceId);
    if (record.balance <= 0) {
      return res.json({ success: false, balance: 0, depleted: true });
    }
    const newBalance = Math.max(0, record.balance - amount);
    await db
      .update(anonymousTokensTable)
      .set({ balance: newBalance })
      .where(eq(anonymousTokensTable.deviceId, deviceId));
    return res.json({ success: true, balance: newBalance, depleted: newBalance <= 0 });
  } catch (err) {
    return res.status(500).json({ error: "Failed to deduct guest tokens" });
  }
});

export default router;
