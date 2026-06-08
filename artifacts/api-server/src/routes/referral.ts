import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, tokenBalancesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const REFERRAL_BONUS = 1_000;

function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(0, chars.length)];
  return code;
}

async function getOrCreateCode(userId: string): Promise<string> {
  const [user] = await db.select({ referralCode: usersTable.referralCode }).from(usersTable).where(eq(usersTable.id, userId));
  if (user?.referralCode) return user.referralCode;

  let code = makeCode();
  let attempts = 0;
  while (attempts < 5) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, code));
    if (!existing) break;
    code = makeCode();
    attempts++;
  }

  await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
  return code;
}

/* ── GET /api/referral/my-code — get or generate referral code ── */
router.get("/referral/my-code", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Sign in required." }); return; }
  const code = await getOrCreateCode(req.user.id);
  res.json({ code, bonus: REFERRAL_BONUS });
});

/* ── POST /api/referral/award — called internally when a referred user verifies email ── */
export async function awardReferralBonus(newUserId: string, refCode: string): Promise<void> {
  if (!refCode?.trim()) return;

  const [referrer] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.referralCode, refCode.trim().toUpperCase()));

  if (!referrer || referrer.id === newUserId) return;

  await db.update(usersTable).set({ referredBy: referrer.id }).where(eq(usersTable.id, newUserId));

  await db.execute(
    sql`INSERT INTO token_balances (user_id, balance, total_used, last_refill_at)
        VALUES (${referrer.id}, ${REFERRAL_BONUS}, 0, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET balance = token_balances.balance + ${REFERRAL_BONUS}`
  );
}

export default router;
