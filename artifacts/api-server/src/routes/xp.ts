import { Router, type IRouter, type Request, type Response } from "express";
import { db, tokenBalancesTable, userReadingRecordsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const XP_PER_TOKEN_CHUNK = 100_000;
const TOKENS_PER_CHUNK = 10_000;

/* ── POST /xp/earn — award XP to the logged-in user ── */
router.post("/xp/earn", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated." }); return; }
  const { amount, source } = req.body as { amount?: number; source?: string };
  if (!amount || amount <= 0 || amount > 10000) {
    res.status(400).json({ error: "Invalid XP amount." });
    return;
  }

  const userId = req.user!.id;
  const [bal] = await db.select().from(tokenBalancesTable).where(eq(tokenBalancesTable.userId, userId));
  if (!bal) {
    await db.insert(tokenBalancesTable).values({ userId }).onConflictDoNothing();
  }

  const [updated] = await db.update(tokenBalancesTable)
    .set({
      xp: (bal?.xp ?? 0) + amount,
      xpTotal: (bal?.xpTotal ?? 0) + amount,
    })
    .where(eq(tokenBalancesTable.userId, userId))
    .returning({ xp: tokenBalancesTable.xp, xpTotal: tokenBalancesTable.xpTotal });

  res.json({ ok: true, xp: updated.xp, xpTotal: updated.xpTotal, source });
});

/* ── POST /xp/convert — convert XP chunks to tokens ── */
router.post("/xp/convert", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated." }); return; }
  const { chunks } = req.body as { chunks?: number };
  const numChunks = Math.floor(chunks ?? 1);
  if (numChunks < 1 || numChunks > 100) {
    res.status(400).json({ error: "Chunks must be between 1 and 100." });
    return;
  }

  const userId = req.user!.id;
  const [bal] = await db.select().from(tokenBalancesTable).where(eq(tokenBalancesTable.userId, userId));
  if (!bal) { res.status(404).json({ error: "No balance record found." }); return; }

  const xpNeeded = numChunks * XP_PER_TOKEN_CHUNK;
  if ((bal.xp ?? 0) < xpNeeded) {
    res.status(400).json({ error: `Not enough XP. Need ${xpNeeded.toLocaleString()} XP, you have ${(bal.xp ?? 0).toLocaleString()}.` });
    return;
  }

  const tokensGained = numChunks * TOKENS_PER_CHUNK;
  const [updated] = await db.update(tokenBalancesTable)
    .set({
      xp: (bal.xp ?? 0) - xpNeeded,
      balance: (bal.balance ?? 0) + tokensGained,
    })
    .where(eq(tokenBalancesTable.userId, userId))
    .returning({ xp: tokenBalancesTable.xp, balance: tokenBalancesTable.balance });

  res.json({ ok: true, tokensGained, xpSpent: xpNeeded, xp: updated.xp, balance: updated.balance });
});

/* ── POST /xp/track-reading — track a reading event and award XP ── */
router.post("/xp/track-reading", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated." }); return; }

  const { resourceType, resourceId, title, author, subject, finished } = req.body as {
    resourceType?: string; resourceId?: number; title?: string;
    author?: string; subject?: string; finished?: boolean;
  };

  if (!resourceType || !resourceId || !title) {
    res.status(400).json({ error: "resourceType, resourceId, and title are required." });
    return;
  }

  const userId = req.user!.id;

  const existing = await db.select().from(userReadingRecordsTable)
    .where(eq(userReadingRecordsTable.userId, userId))
    .then(rows => rows.find(r => r.resourceType === resourceType && r.resourceId === resourceId));

  const XP_OPEN: Record<string, number> = {
    novel: 50,
    textbook: 50,
    green_book: 50,
    past_paper: 100,
  };
  const XP_FINISH: Record<string, number> = {
    novel: 500,
    textbook: 150,
    green_book: 150,
    past_paper: 200,
  };

  let xpAwarded = 0;

  if (!existing) {
    xpAwarded = XP_OPEN[resourceType] ?? 50;
    await db.insert(userReadingRecordsTable).values({
      userId,
      resourceType,
      resourceId,
      title,
      author: author ?? null,
      subject: subject ?? null,
      finished: finished ?? false,
      xpAwarded,
      finishedAt: finished ? new Date() : null,
    });
  } else if (finished && !existing.finished) {
    const finishXp = XP_FINISH[resourceType] ?? 200;
    xpAwarded = finishXp;
    await db.update(userReadingRecordsTable)
      .set({ finished: true, finishedAt: new Date(), xpAwarded: existing.xpAwarded + finishXp })
      .where(eq(userReadingRecordsTable.id, existing.id));
  }

  if (xpAwarded > 0) {
    const [bal] = await db.select().from(tokenBalancesTable).where(eq(tokenBalancesTable.userId, userId));
    await db.update(tokenBalancesTable)
      .set({
        xp: (bal?.xp ?? 0) + xpAwarded,
        xpTotal: (bal?.xpTotal ?? 0) + xpAwarded,
      })
      .where(eq(tokenBalancesTable.userId, userId));
  }

  res.json({ ok: true, xpAwarded, alreadyTracked: !!existing && !(finished && !existing.finished) });
});

/* ── GET /xp/reading-stats — user's reading history and stats ── */
router.get("/xp/reading-stats", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated." }); return; }

  const userId = req.user!.id;
  const records = await db.select().from(userReadingRecordsTable)
    .where(eq(userReadingRecordsTable.userId, userId))
    .orderBy(desc(userReadingRecordsTable.openedAt));

  const novels = records.filter(r => r.resourceType === "novel");
  const books = records.filter(r => r.resourceType === "textbook" || r.resourceType === "green_book");
  const papers = records.filter(r => r.resourceType === "past_paper");

  res.json({
    records,
    stats: {
      novelsOpened: novels.length,
      novelsFinished: novels.filter(r => r.finished).length,
      booksOpened: books.length,
      booksFinished: books.filter(r => r.finished).length,
      papersStudied: papers.length,
      totalXpFromReading: records.reduce((s, r) => s + r.xpAwarded, 0),
    },
  });
});

export default router;
