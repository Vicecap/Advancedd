import { Router } from "express";
import { db } from "@workspace/db";
import { anonymousTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const WEEKLY_ALLOWANCE = 100_000;
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

router.get("/guest/balance", async (req, res) => {
  const deviceId = req.query["deviceId"] as string | undefined;
  if (!deviceId || deviceId.length < 8) {
    return res.status(400).json({ error: "Invalid deviceId" });
  }
  try {
    const record = await getOrCreateRecord(deviceId);
    const resetAt = record.lastRefillAt.getTime() + ONE_WEEK_MS;
    return res.json({ balance: record.balance, weeklyAllowance: WEEKLY_ALLOWANCE, resetAt });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch guest balance" });
  }
});

router.post("/guest/deduct", async (req, res) => {
  const { deviceId, amount = 10_000 } = req.body as { deviceId?: string; amount?: number };
  if (!deviceId || deviceId.length < 8) {
    return res.status(400).json({ error: "Invalid deviceId" });
  }
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
