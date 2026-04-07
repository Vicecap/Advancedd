import { Router, type Request, type Response } from "express";
import { db, userStreaksTable, tokenBalancesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const MILESTONES: { days: number; label: string; tokens: number; badge: string }[] = [
  { days: 3,   label: "3-Day Streak",      tokens: 50_000,    badge: "Consistent Learner" },
  { days: 7,   label: "Week Warrior",       tokens: 150_000,   badge: "Week Warrior"       },
  { days: 14,  label: "Fortnight Champion", tokens: 300_000,   badge: "Fortnight Champion" },
  { days: 30,  label: "Monthly Master",     tokens: 750_000,   badge: "Monthly Master"     },
  { days: 60,  label: "Unstoppable",        tokens: 1_500_000, badge: "Unstoppable"        },
  { days: 100, label: "Century Scholar",    tokens: 3_000_000, badge: "Century Scholar"    },
];

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getOrCreateStreak(userId: string) {
  const [row] = await db.select().from(userStreaksTable).where(eq(userStreaksTable.userId, userId));
  if (row) return row;
  const [created] = await db
    .insert(userStreaksTable)
    .values({ userId })
    .returning();
  return created;
}

/* ── GET /streak — fetch current streak + milestones ──────────────────────── */
router.get("/streak", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const streak = await getOrCreateStreak(req.user.id);
    res.json({ streak, milestones: MILESTONES });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load streak" });
  }
});

/* ── POST /streak/checkin — record daily activity ─────────────────────────── */
router.post("/streak/checkin", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const userId = req.user.id;
    const today = todayUTC();
    const streak = await getOrCreateStreak(userId);

    if (streak.lastActiveDate === today) {
      res.json({ streak, milestones: MILESTONES, newMilestones: [], dailyXp: 0 });
      return;
    }

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const newCurrent = streak.lastActiveDate === yesterdayStr
      ? streak.currentStreak + 1
      : 1;
    const newBest = Math.max(newCurrent, streak.bestStreak);

    const claimed = (streak.claimedMilestones ?? []) as number[];
    const newMilestones = MILESTONES.filter(
      m => newCurrent >= m.days && !claimed.includes(m.days)
    );
    const totalTokenReward = newMilestones.reduce((s, m) => s + m.tokens, 0);
    const newClaimed = [...claimed, ...newMilestones.map(m => m.days)];

    const [updated] = await db
      .update(userStreaksTable)
      .set({
        currentStreak: newCurrent,
        bestStreak: newBest,
        lastActiveDate: today,
        claimedMilestones: newClaimed,
        updatedAt: new Date(),
      })
      .where(eq(userStreaksTable.userId, userId))
      .returning();

    const DAILY_XP = 15;
    const milestoneXp = newMilestones.reduce((s, m) => s + Math.round(m.tokens / 1000), 0);
    const totalXp = DAILY_XP + milestoneXp;

    await db
      .update(tokenBalancesTable)
      .set({
        balance: totalTokenReward > 0 ? sql`${tokenBalancesTable.balance} + ${totalTokenReward}` : tokenBalancesTable.balance,
        xp: sql`${tokenBalancesTable.xp} + ${totalXp}`,
        xpTotal: sql`${tokenBalancesTable.xpTotal} + ${totalXp}`,
      })
      .where(eq(tokenBalancesTable.userId, userId));

    res.json({ streak: updated, milestones: MILESTONES, newMilestones, dailyXp: totalXp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check in" });
  }
});

export default router;
