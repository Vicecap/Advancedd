import { Router } from "express";
import { db, quizPlayers, quizSessions, quizDailyChallenges, tokenBalancesTable, usersTable } from "@workspace/db";
import { eq, desc, gte, sql } from "drizzle-orm";
import { openrouter } from "@workspace/integrations-openrouter-ai";

async function deductTokens(userId: string, amount: number): Promise<void> {
  try {
    const [user] = await db.select({ isPremium: usersTable.isPremium }).from(usersTable).where(eq(usersTable.id, userId));
    if (user?.isPremium) return;
    await db.update(tokenBalancesTable)
      .set({
        balance: sql`GREATEST(0, ${tokenBalancesTable.balance} - ${amount})`,
        totalUsed: sql`${tokenBalancesTable.totalUsed} + ${amount}`,
      })
      .where(eq(tokenBalancesTable.userId, userId));
  } catch (err) {
    console.error("Failed to deduct tokens in quiz", err);
  }
}

const router = Router();

const XP_PER_CORRECT = 10;
const DAILY_BONUS_XP = 100;
const PERFECT_BONUS_XP = 50;
const DIFFICULTY_MULT: Record<string, number> = { easy: 1, medium: 1.5, hard: 2, any: 1.2 };
const SIZE_MULT: Record<number, number> = { 5: 1, 10: 1.2, 15: 1.4, 20: 1.6 };

function calcXP(correct: number, total: number, difficulty: string, isDaily: boolean): number {
  const diff = DIFFICULTY_MULT[difficulty] ?? 1;
  const sizeMult = SIZE_MULT[total] ?? 1;
  let xp = Math.round(correct * XP_PER_CORRECT * diff * sizeMult);
  const pct = total > 0 ? correct / total : 0;
  if (pct === 1) xp += PERFECT_BONUS_XP;
  if (isDaily) xp += DAILY_BONUS_XP;
  return xp;
}

function startOfWeek(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}
function startOfMonth(): Date {
  const d = new Date();
  d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
  return d;
}

router.post("/player/init", async (req, res) => {
  try {
    const { playerId, displayName } = req.body as { playerId: string; displayName?: string };
    if (!playerId) return res.status(400).json({ error: "playerId required" });

    const [existing] = await db.select().from(quizPlayers).where(eq(quizPlayers.id, playerId));
    if (existing) {
      if (displayName && displayName !== existing.displayName) {
        await db.update(quizPlayers).set({ displayName }).where(eq(quizPlayers.id, playerId));
        return res.json({ ...existing, displayName });
      }
      return res.json(existing);
    }

    const name = (displayName ?? "Player").slice(0, 50) || "Player";
    await db.insert(quizPlayers).values({ id: playerId, displayName: name });
    return res.json({ id: playerId, displayName: name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to init player" });
  }
});

router.post("/session/complete", async (req, res) => {
  try {
    const { playerId, topic, source, difficulty, totalQuestions, correct, isDailyChallenge } =
      req.body as {
        playerId: string; topic: string; source: string; difficulty: string;
        totalQuestions: number; correct: number; isDailyChallenge?: boolean;
      };

    if (!playerId || totalQuestions == null || correct == null)
      return res.status(400).json({ error: "Missing required fields" });

    const scorePct = totalQuestions > 0 ? ((correct / totalQuestions) * 100).toFixed(2) : "0.00";
    const passed = parseFloat(scorePct) >= 60;
    const xpEarned = calcXP(correct, totalQuestions, difficulty ?? "any", !!isDailyChallenge);

    const [session] = await db.insert(quizSessions).values({
      playerId, topic: topic ?? "Mixed", source: source ?? "opentdb",
      difficulty: difficulty ?? "any", totalQuestions, correct,
      scorePct, passed, xpEarned, isDailyChallenge: !!isDailyChallenge,
    }).returning();

    if (req.isAuthenticated() && xpEarned > 0) {
      try {
        await db.update(tokenBalancesTable)
          .set({
            xp: sql`COALESCE(${tokenBalancesTable.xp}, 0) + ${xpEarned}`,
            xpTotal: sql`COALESCE(${tokenBalancesTable.xpTotal}, 0) + ${xpEarned}`,
          })
          .where(eq(tokenBalancesTable.userId, req.user!.id));
      } catch (e) {
        console.error("Failed to update XP from quiz", e);
      }
    }

    res.json({ session, xpEarned, passed, scorePct: parseFloat(scorePct) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save session" });
  }
});

router.get("/leaderboard", async (_req, res) => {
  try {
    const allTime = await db
      .select({
        playerId: quizSessions.playerId,
        displayName: quizPlayers.displayName,
        totalXP: sql<number>`sum(${quizSessions.xpEarned})`.as("total_xp"),
        sessions: sql<number>`count(*)`.as("sessions"),
        avgScore: sql<number>`round(avg(${quizSessions.scorePct})::numeric, 1)`.as("avg_score"),
        passed: sql<number>`sum(case when ${quizSessions.passed} then 1 else 0 end)`.as("passed"),
      })
      .from(quizSessions)
      .innerJoin(quizPlayers, eq(quizSessions.playerId, quizPlayers.id))
      .groupBy(quizSessions.playerId, quizPlayers.displayName)
      .orderBy(desc(sql`total_xp`))
      .limit(50);

    const weekly = await db
      .select({
        playerId: quizSessions.playerId,
        displayName: quizPlayers.displayName,
        totalXP: sql<number>`sum(${quizSessions.xpEarned})`.as("total_xp"),
        sessions: sql<number>`count(*)`.as("sessions"),
        avgScore: sql<number>`round(avg(${quizSessions.scorePct})::numeric, 1)`.as("avg_score"),
      })
      .from(quizSessions)
      .innerJoin(quizPlayers, eq(quizSessions.playerId, quizPlayers.id))
      .where(gte(quizSessions.completedAt, startOfWeek()))
      .groupBy(quizSessions.playerId, quizPlayers.displayName)
      .orderBy(desc(sql`total_xp`))
      .limit(50);

    const monthly = await db
      .select({
        playerId: quizSessions.playerId,
        displayName: quizPlayers.displayName,
        totalXP: sql<number>`sum(${quizSessions.xpEarned})`.as("total_xp"),
        sessions: sql<number>`count(*)`.as("sessions"),
        avgScore: sql<number>`round(avg(${quizSessions.scorePct})::numeric, 1)`.as("avg_score"),
      })
      .from(quizSessions)
      .innerJoin(quizPlayers, eq(quizSessions.playerId, quizPlayers.id))
      .where(gte(quizSessions.completedAt, startOfMonth()))
      .groupBy(quizSessions.playerId, quizPlayers.displayName)
      .orderBy(desc(sql`total_xp`))
      .limit(50);

    res.json({ allTime, weekly, monthly });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.get("/analytics/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;

    const [player] = await db.select().from(quizPlayers).where(eq(quizPlayers.id, playerId));
    if (!player) return res.status(404).json({ error: "Player not found" });

    const sessions = await db
      .select()
      .from(quizSessions)
      .where(eq(quizSessions.playerId, playerId))
      .orderBy(desc(quizSessions.completedAt))
      .limit(200);

    if (sessions.length === 0) {
      return res.json({ player, totalSessions: 0, totalXP: 0, avgScore: 0, passRate: 0, streak: 0, byTopic: [], byDifficulty: [], recent: [] });
    }

    const totalXP = sessions.reduce((s, r) => s + r.xpEarned, 0);
    const avgScore = sessions.reduce((s, r) => s + parseFloat(String(r.scorePct)), 0) / sessions.length;
    const passRate = (sessions.filter(r => r.passed).length / sessions.length) * 100;

    const topicMap = new Map<string, { xp: number; sessions: number; totalScore: number; passed: number }>();
    const diffMap = new Map<string, { xp: number; sessions: number; totalScore: number; passed: number }>();

    for (const s of sessions) {
      const t = s.topic;
      if (!topicMap.has(t)) topicMap.set(t, { xp: 0, sessions: 0, totalScore: 0, passed: 0 });
      const td = topicMap.get(t)!;
      td.xp += s.xpEarned; td.sessions++; td.totalScore += parseFloat(String(s.scorePct)); if (s.passed) td.passed++;

      const d = s.difficulty;
      if (!diffMap.has(d)) diffMap.set(d, { xp: 0, sessions: 0, totalScore: 0, passed: 0 });
      const dd = diffMap.get(d)!;
      dd.xp += s.xpEarned; dd.sessions++; dd.totalScore += parseFloat(String(s.scorePct)); if (s.passed) dd.passed++;
    }

    const byTopic = [...topicMap.entries()]
      .map(([topic, v]) => ({ topic, ...v, avgScore: Math.round(v.totalScore / v.sessions) }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10);

    const byDifficulty = [...diffMap.entries()]
      .map(([difficulty, v]) => ({ difficulty, ...v, avgScore: Math.round(v.totalScore / v.sessions) }));

    const uniqueDays = new Set(sessions.map(s => s.completedAt.toISOString().slice(0, 10)));
    const sortedDays = [...uniqueDays].sort().reverse();
    let streak = 0;
    const today = new Date().toISOString().slice(0, 10);
    let checking = today;
    for (const day of sortedDays) {
      if (day === checking) { streak++; const d = new Date(checking); d.setUTCDate(d.getUTCDate() - 1); checking = d.toISOString().slice(0, 10); }
      else break;
    }

    const weeklyXP = sessions
      .filter(s => s.completedAt >= startOfWeek())
      .reduce((sum, s) => sum + s.xpEarned, 0);
    const monthlyXP = sessions
      .filter(s => s.completedAt >= startOfMonth())
      .reduce((sum, s) => sum + s.xpEarned, 0);

    res.json({
      player, totalSessions: sessions.length, totalXP, avgScore: Math.round(avgScore * 10) / 10,
      passRate: Math.round(passRate), streak, weeklyXP, monthlyXP,
      byTopic, byDifficulty, recent: sessions.slice(0, 20),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get("/daily-challenge", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [existing] = await db.select().from(quizDailyChallenges).where(eq(quizDailyChallenges.challengeDate, today));
    if (existing) return res.json(existing);

    const challenges = [
      { topic: "General Knowledge", categoryId: "9", source: "opentdb", difficulty: "medium" },
      { topic: "Science & Nature", categoryId: "17", source: "opentdb", difficulty: "medium" },
      { topic: "History", categoryId: "23", source: "opentdb", difficulty: "medium" },
      { topic: "Geography", categoryId: "22", source: "opentdb", difficulty: "medium" },
      { topic: "Science: Computers", categoryId: "18", source: "opentdb", difficulty: "medium" },
      { topic: "Sports", categoryId: "21", source: "opentdb", difficulty: "easy" },
      { topic: "Entertainment: Film", categoryId: "11", source: "opentdb", difficulty: "easy" },
      { topic: "Entertainment: Music", categoryId: "12", source: "opentdb", difficulty: "easy" },
      { topic: "General Knowledge", categoryId: "9", source: "opentdb", difficulty: "hard" },
      { topic: "Science & Nature", categoryId: "17", source: "opentdb", difficulty: "hard" },
      { topic: "General Knowledge", categoryId: "", source: "trivia-api", difficulty: "medium" },
      { topic: "Science", categoryId: "science", source: "trivia-api", difficulty: "medium" },
      { topic: "History", categoryId: "history", source: "trivia-api", difficulty: "medium" },
      { topic: "Geography", categoryId: "geography", source: "trivia-api", difficulty: "medium" },
      { topic: "Arts & Literature", categoryId: "arts_and_literature", source: "trivia-api", difficulty: "easy" },
      { topic: "Sport & Leisure", categoryId: "sport_and_leisure", source: "trivia-api", difficulty: "easy" },
    ];
    const seed = new Date(today).getTime();
    const pick = challenges[(seed / 86400000) % challenges.length | 0];

    const [created] = await db.insert(quizDailyChallenges).values({ challengeDate: today, ...pick }).returning();
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to get daily challenge" });
  }
});

router.post("/explain", async (req, res) => {
  try {
    const { question, correctAnswer, userAnswer, category, difficulty, isCorrect } = req.body as {
      question: string; correctAnswer: string; userAnswer?: string;
      category?: string; difficulty?: string; isCorrect?: boolean;
    };
    if (!question || !correctAnswer) return res.status(400).json({ error: "question and correctAnswer required" });

    const userAnswerLine = userAnswer
      ? `The student answered: "${userAnswer}" — which is ${isCorrect ? "CORRECT ✓" : "INCORRECT ✗"}.`
      : "";
    const categoryLine = category ? `Category: ${category}` : "";
    const diffLine = difficulty ? `Difficulty: ${difficulty}` : "";

    const response = await openrouter.chat.completions.create({
      model: "qwen/qwen3.5-122b-a10b",
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content: "You are a friendly, encouraging quiz tutor. Explain quiz questions clearly and concisely in 3-5 sentences. Use simple language suitable for O-Level students. Include a key fact or memory tip when helpful. Never be condescending.",
        },
        {
          role: "user",
          content: `Question: "${question}"\nCorrect answer: "${correctAnswer}"\n${userAnswerLine}\n${categoryLine}\n${diffLine}\n\nPlease explain why "${correctAnswer}" is the correct answer. If the student was wrong, gently clarify the misconception. Keep it educational and concise.`,
        },
      ],
    });

    const explanation = response.choices[0]?.message?.content ?? "";
    const tokensUsed = response.usage?.total_tokens ?? Math.max(80, Math.ceil(explanation.length / 4));
    res.json({ explanation });

    // Deduct tokens if user is authenticated
    try {
      const sid = req.cookies?.sid as string | undefined;
      if (sid) {
        const { getSession } = await import("../lib/auth.js");
        const session = await getSession(sid);
        if (session?.userId) await deductTokens(session.userId, tokensUsed);
      }
    } catch {}
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI explanation failed. Please try again." });
  }
});

export default router;
