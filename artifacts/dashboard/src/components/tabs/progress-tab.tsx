import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, Star, Trophy, TrendingUp, BookOpen, Brain, Target,
  Zap, Lock, CheckCircle2, BarChart3, ArrowRight, Calendar,
  RefreshCw, GraduationCap, Lightbulb, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(path: string) { return `${BASE_URL}api${path}`; }

/* ── Level system ─────────────────────────────────────────────────────────── */
const LEVELS = [
  { level: 1, name: "Beginner",     xpMin: 0,      xpMax: 499,    color: "text-slate-400",  bg: "rgba(148,163,184,0.15)",  border: "rgba(148,163,184,0.35)",  emoji: "🌱" },
  { level: 2, name: "Explorer",     xpMin: 500,    xpMax: 1499,   color: "text-emerald-400",bg: "rgba(16,185,129,0.15)",   border: "rgba(16,185,129,0.35)",   emoji: "🔍" },
  { level: 3, name: "Learner",      xpMin: 1500,   xpMax: 3499,   color: "text-blue-400",   bg: "rgba(59,130,246,0.15)",   border: "rgba(59,130,246,0.35)",   emoji: "📖" },
  { level: 4, name: "Student",      xpMin: 3500,   xpMax: 6999,   color: "text-violet-400", bg: "rgba(139,92,246,0.15)",   border: "rgba(139,92,246,0.35)",   emoji: "✏️" },
  { level: 5, name: "Scholar",      xpMin: 7000,   xpMax: 12999,  color: "text-amber-400",  bg: "rgba(245,158,11,0.15)",   border: "rgba(245,158,11,0.35)",   emoji: "🏆" },
  { level: 6, name: "Expert",       xpMin: 13000,  xpMax: 24999,  color: "text-orange-400", bg: "rgba(249,115,22,0.15)",   border: "rgba(249,115,22,0.35)",   emoji: "⚡" },
  { level: 7, name: "Master",       xpMin: 25000,  xpMax: Infinity, color: "text-red-400",  bg: "rgba(239,68,68,0.15)",    border: "rgba(239,68,68,0.35)",    emoji: "🔥" },
];

function getLevelInfo(xp: number) {
  return LEVELS.find(l => xp >= l.xpMin && xp <= l.xpMax) ?? LEVELS[0];
}

function getXpProgress(xp: number) {
  const lvl = getLevelInfo(xp);
  if (lvl.xpMax === Infinity) return 100;
  const range = lvl.xpMax - lvl.xpMin + 1;
  return Math.min(100, Math.round(((xp - lvl.xpMin) / range) * 100));
}

/* ── Streak tracking ─────────────────────────────────────────────────────── */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getStreakData(): { streak: number; dates: string[] } {
  try {
    const raw = localStorage.getItem("progress_streak");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { streak: 0, dates: [] };
}

function updateStreak() {
  const today = todayKey();
  const data = getStreakData();

  if (data.dates.includes(today)) return data.streak;

  const yesterday = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const hadYesterday = data.dates.includes(yesterday);
  const newStreak = hadYesterday ? data.streak + 1 : 1;
  const newDates = [...data.dates.slice(-30), today];
  localStorage.setItem("progress_streak", JSON.stringify({ streak: newStreak, dates: newDates }));
  return newStreak;
}

/* ── Badge definitions ───────────────────────────────────────────────────── */
interface BadgeDef {
  id: string; name: string; desc: string; emoji: string;
  color: string; bg: string; border: string;
  check: (stats: UserStats) => boolean;
}

interface UserStats {
  totalSolved: number; streak: number; quizSessions: number;
  quizPerfect: number; topicCounts: Record<string, number>;
  xpTotal: number;
}

const BADGES: BadgeDef[] = [
  {
    id: "first_steps", name: "First Steps", emoji: "👶", desc: "Solved your first problem",
    color: "text-slate-300", bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.3)",
    check: s => s.totalSolved >= 1,
  },
  {
    id: "algebra_explorer", name: "Algebra Explorer", emoji: "🔠", desc: "Solved 5 algebra problems",
    color: "text-violet-400", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.3)",
    check: s => (s.topicCounts["solve"] ?? 0) >= 5,
  },
  {
    id: "algebra_master", name: "Algebra Master", emoji: "🧮", desc: "Solved 20 algebra problems",
    color: "text-violet-300", bg: "rgba(139,92,246,0.2)", border: "rgba(139,92,246,0.45)",
    check: s => (s.topicCounts["solve"] ?? 0) >= 20,
  },
  {
    id: "consistent", name: "Consistent Learner", emoji: "📅", desc: "3-day login streak",
    color: "text-emerald-400", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)",
    check: s => s.streak >= 3,
  },
  {
    id: "week_warrior", name: "Week Warrior", emoji: "🔥", desc: "7-day login streak",
    color: "text-orange-400", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.3)",
    check: s => s.streak >= 7,
  },
  {
    id: "problem_solver", name: "Problem Solver", emoji: "💡", desc: "Solved 25 problems",
    color: "text-yellow-400", bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.3)",
    check: s => s.totalSolved >= 25,
  },
  {
    id: "century_club", name: "Century Club", emoji: "💯", desc: "Solved 100 problems",
    color: "text-amber-300", bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.35)",
    check: s => s.totalSolved >= 100,
  },
  {
    id: "quiz_starter", name: "Quiz Starter", emoji: "🎮", desc: "Completed your first quiz",
    color: "text-blue-400", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.3)",
    check: s => s.quizSessions >= 1,
  },
  {
    id: "quiz_champion", name: "Quiz Champion", emoji: "🏆", desc: "Got 100% on a quiz",
    color: "text-yellow-300", bg: "rgba(250,204,21,0.15)", border: "rgba(250,204,21,0.35)",
    check: s => s.quizPerfect >= 1,
  },
  {
    id: "calculus_fan", name: "Calculus Fan", emoji: "∫", desc: "Solved 5 calculus problems",
    color: "text-cyan-400", bg: "rgba(34,211,238,0.15)", border: "rgba(34,211,238,0.3)",
    check: s => ((s.topicCounts["diff"] ?? 0) + (s.topicCounts["integrate"] ?? 0)) >= 5,
  },
  {
    id: "xp_hunter", name: "XP Hunter", emoji: "⭐", desc: "Earned 1,000 total XP",
    color: "text-amber-400", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)",
    check: s => s.xpTotal >= 1000,
  },
  {
    id: "scholar", name: "Scholar", emoji: "🎓", desc: "Earned 10,000 total XP",
    color: "text-red-400", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)",
    check: s => s.xpTotal >= 10000,
  },
];

/* ── Topic labels for weak-area display ─────────────────────────────────── */
const TOPIC_LABELS: Record<string, string> = {
  solve: "Algebra / Equations", factor: "Factorisation", expand: "Expansion",
  diff: "Differentiation", integrate: "Integration", limit: "Limits",
  divide: "Polynomial Division", matrix: "Matrix Operations", simplify: "Simplification",
  evaluate: "Evaluation", plot: "Graph Plotting", geometry: "Geometry",
};

const TOPIC_PRACTICE_TAB: Record<string, string> = {
  solve: "solver", factor: "solver", expand: "solver",
  diff: "solver", integrate: "solver", limit: "solver",
  divide: "solver", matrix: "solver", simplify: "solver",
};

/* ── Component ───────────────────────────────────────────────────────────── */
interface ProgressTabProps {
  setActiveTab?: (tab: string) => void;
}

export default function ProgressTab({ setActiveTab }: ProgressTabProps) {
  const { user, isAuthenticated } = useAuth();
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [quizAnalytics, setQuizAnalytics] = useState<any | null>(null);
  const [xpData, setXpData] = useState<{ xp: number; xpTotal: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [milestoneRewards, setMilestoneRewards] = useState<{ label: string; tokens: number; badge: string }[]>([]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const newStreak = updateStreak();
      setStreak(newStreak);

      // Fetch all data sources in parallel
      const fetches: Promise<void>[] = [];

      fetches.push(
        fetch(api("/history?limit=500"), { credentials: "include" })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setHistory(d.entries ?? []); })
          .catch(() => {})
      );

      if (isAuthenticated) {
        // Run streak check-in FIRST (awards daily XP + milestone tokens)
        // then fetch tokens/balance so we see the updated XP value
        let checkinDailyXp = 0;
        try {
          const cr = await fetch(api("/streak/checkin"), { method: "POST", credentials: "include" });
          if (cr.ok) {
            const d = await cr.json();
            if (d.streak?.currentStreak) setStreak(d.streak.currentStreak);
            if (d.newMilestones?.length > 0) setMilestoneRewards(d.newMilestones);
            checkinDailyXp = d.dailyXp ?? 0;
          }
        } catch {}

        // Now fetch the rest in parallel — balance reflects the post-checkin state
        fetches.push(
          fetch(api("/activity"), { credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setActivities(d.activities ?? []); })
            .catch(() => {})
        );

        fetches.push(
          fetch(api("/tokens/balance"), { credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setXpData({ xp: d.xp ?? 0, xpTotal: d.xpTotal ?? 0 }); })
            .catch(() => {})
        );

        // Show a small toast for daily XP even without a milestone
        if (checkinDailyXp > 0 && milestoneRewards.length === 0) {
          setMilestoneRewards([{ label: "Daily Login Bonus", tokens: 0, badge: `+${checkinDailyXp} XP earned` }]);
        }
      }

      const playerId = (() => {
        try { const raw = localStorage.getItem("quiz_player"); return raw ? JSON.parse(raw).id : null; } catch { return null; }
      })();
      if (playerId) {
        fetches.push(
          fetch(api(`/quiz/analytics/${playerId}`))
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setQuizAnalytics(d); })
            .catch(() => {})
        );
      }

      await Promise.all(fetches);
    } catch {}
    if (!silent) setLoading(false);
  }, [isAuthenticated]);

  // Load on mount
  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh when the tab regains focus (user comes back from solving)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadData(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadData]);

  /* ── Derived stats ────────────────────────────────────────────────────────── */
  const today = todayKey();

  // XP total from server (authoritative) or fallback
  const xpTotal = xpData?.xpTotal ?? 0;
  const levelInfo = getLevelInfo(xpTotal);
  const xpPct = getXpProgress(xpTotal);

  // Today's activities from the activity log (real source of truth)
  const todayActivities = activities.filter(a => {
    try { return new Date(a.createdAt).toISOString().slice(0, 10) === today; } catch { return false; }
  });

  // Today's XP from actual logged XP values
  const todayXP = todayActivities.reduce((sum, a) => sum + (Number(a.xpEarned) || 0), 0);

  // Today's computation history (for "solves today" count as fallback)
  const todayHistory = history.filter(h => {
    try { return new Date(h.createdAt).toISOString().slice(0, 10) === today; } catch { return false; }
  });

  // Combine activity log counts + computation history for totalSolved
  const solveActivityCount = activities.filter(a =>
    ["ai_solve", "compute", "external_solve"].includes(a.type)
  ).length;
  const totalSolved = Math.max(history.length, solveActivityCount);

  // Today's total actions across all sources
  const todaySolves = Math.max(todayHistory.length, todayActivities.filter(a =>
    ["ai_solve", "compute", "external_solve", "homework_help", "ocr_analysis"].includes(a.type)
  ).length);

  // Topic breakdown from computation history (has operation field)
  const topicCounts: Record<string, number> = {};
  history.forEach(h => {
    const op = h.operation ?? "solve";
    topicCounts[op] = (topicCounts[op] ?? 0) + 1;
  });

  const userStats: UserStats = {
    totalSolved,
    streak,
    quizSessions: quizAnalytics?.totalSessions ?? 0,
    quizPerfect: quizAnalytics?.byTopic
      ? Object.values(quizAnalytics.byTopic as Record<string, any>).filter((t: any) => t.passRate >= 100).length
      : 0,
    topicCounts,
    xpTotal,
  };

  const earnedBadges = BADGES.filter(b => b.check(userStats));
  const lockedBadges = BADGES.filter(b => !b.check(userStats));

  /* Weak topics: operations with fewest attempts */
  const sortedTopics = Object.entries(topicCounts).sort((a, b) => a[1] - b[1]);
  const weakTopics = sortedTopics.slice(0, 3).map(([op]) => op);
  const strongTopics = sortedTopics.slice(-2).map(([op]) => op).filter(op => topicCounts[op] > 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="space-y-5 max-w-4xl mx-auto">

      {/* ── Header ── */}
      <div className="rounded-2xl p-5 flex items-center justify-between gap-4"
        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.08) 100%)", border: "1px solid rgba(139,92,246,0.25)" }}>
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl" style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.35)" }}>
            <BarChart3 className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-display font-black text-white">My Progress</h2>
            <p className="text-sm text-muted-foreground">
              {isAuthenticated ? `Welcome back, ${user?.firstName ?? "student"}!` : "Sign in to unlock full progress tracking"}
            </p>
          </div>
        </div>
        <button onClick={() => loadData()} className="p-2 rounded-xl text-muted-foreground hover:text-white transition-all hover:bg-white/10 border border-white/10">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Milestone Reward Banner ── */}
      <AnimatePresence>
        {milestoneRewards.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(249,115,22,0.1))", border: "1px solid rgba(245,158,11,0.4)" }}>
            <Trophy className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-300">{milestoneRewards.some(m => m.tokens > 0) ? "Streak Milestone Reached!" : "Daily Streak Reward"}</p>
              {milestoneRewards.map(m => (
                <p key={m.label} className="text-xs text-amber-200/80 mt-0.5">
                  {m.tokens > 0
                    ? `${m.label} — +${(m.tokens / 1000).toFixed(0)}K tokens & ${Math.round(m.tokens / 1000)} XP awarded`
                    : m.badge}
                </p>
              ))}
            </div>
            <button onClick={() => setMilestoneRewards([])} className="text-amber-400/60 hover:text-amber-300 text-xs">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Streak */}
        <div className="rounded-2xl p-4 flex flex-col items-center gap-2 text-center"
          style={{ background: streak >= 7 ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.03)", border: streak >= 7 ? "1px solid rgba(249,115,22,0.35)" : "1px solid rgba(255,255,255,0.1)" }}>
          <Flame className={cn("w-7 h-7", streak >= 7 ? "text-orange-400" : streak >= 3 ? "text-amber-400" : "text-slate-500")} />
          <div>
            <p className={cn("text-2xl font-black", streak >= 7 ? "text-orange-300" : streak >= 3 ? "text-amber-300" : "text-muted-foreground")}>{streak}</p>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Day Streak</p>
          </div>
        </div>

        {/* Level */}
        <div className="rounded-2xl p-4 flex flex-col items-center gap-2 text-center"
          style={{ background: levelInfo.bg, border: `1px solid ${levelInfo.border}` }}>
          <span className="text-2xl">{levelInfo.emoji}</span>
          <div>
            <p className={cn("text-lg font-black", levelInfo.color)}>Lvl {levelInfo.level}</p>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{levelInfo.name}</p>
          </div>
        </div>

        {/* Today solved */}
        <div className="rounded-2xl p-4 flex flex-col items-center gap-2 text-center"
          style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <Brain className="w-7 h-7 text-emerald-400" />
          <div>
            <p className="text-2xl font-black text-emerald-300">{todaySolves}</p>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Today's Solves</p>
          </div>
        </div>

        {/* Total XP */}
        <div className="rounded-2xl p-4 flex flex-col items-center gap-2 text-center"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <Star className="w-7 h-7 text-amber-400" />
          <div>
            <p className="text-2xl font-black text-amber-300">{xpTotal >= 1000 ? `${(xpTotal / 1000).toFixed(1)}k` : xpTotal}</p>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total XP</p>
          </div>
        </div>
      </div>

      {/* ── Level Progress Bar ── */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{levelInfo.emoji}</span>
            <div>
              <p className={cn("text-sm font-bold", levelInfo.color)}>{levelInfo.name} — Level {levelInfo.level}</p>
              <p className="text-xs text-muted-foreground">
                {levelInfo.xpMax === Infinity ? `${xpTotal.toLocaleString()} XP — Max Level!` : `${xpTotal.toLocaleString()} / ${(levelInfo.xpMax + 1).toLocaleString()} XP`}
              </p>
            </div>
          </div>
          <span className={cn("text-sm font-black", levelInfo.color)}>{xpPct}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${xpPct}%` }} transition={{ duration: 1, ease: "easeOut" }}
            style={{ background: `linear-gradient(90deg, ${levelInfo.border}, ${levelInfo.color.replace("text-", "")})` }} />
        </div>
        {levelInfo.xpMax !== Infinity && (
          <p className="text-xs text-muted-foreground mt-2">
            {(levelInfo.xpMax + 1 - xpTotal).toLocaleString()} XP to next level
          </p>
        )}
      </div>

      {/* ── Today's Summary ── */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Today's Summary</h3>
          <span className="text-xs text-muted-foreground">({new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })})</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <p className="text-xl font-black text-blue-300">{todaySolves}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Problems Solved</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <p className="text-xl font-black text-amber-300">+{todayXP}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">XP Earned</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <p className="text-xl font-black text-emerald-300">{streak}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Day Streak</p>
          </div>
        </div>

        {todaySolves === 0 && (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)" }}>
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-200/80">You haven't solved any problems yet today. Keep your streak going!</p>
          </div>
        )}
      </div>

      {/* ── Weak Topics + Strong Topics ── */}
      {history.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Weak topics */}
          <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Needs Practice</h3>
            </div>
            {weakTopics.length === 0 ? (
              <p className="text-xs text-muted-foreground">Solve more problems to see your weak areas.</p>
            ) : (
              <div className="space-y-2">
                {weakTopics.map(op => (
                  <div key={op} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-red-300 truncate">{TOPIC_LABELS[op] ?? op}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">({topicCounts[op] ?? 0} attempts)</span>
                    </div>
                    {setActiveTab && TOPIC_PRACTICE_TAB[op] && (
                      <button onClick={() => setActiveTab(TOPIC_PRACTICE_TAB[op])}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-red-300 shrink-0 transition-all hover:bg-red-500/20 border border-red-500/25">
                        Practice <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Strong topics */}
          <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">You're Good At</h3>
            </div>
            {strongTopics.length === 0 ? (
              <p className="text-xs text-muted-foreground">Keep solving problems to discover your strengths!</p>
            ) : (
              <div className="space-y-2">
                {strongTopics.map(op => (
                  <div key={op} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-300">{TOPIC_LABELS[op] ?? op}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{topicCounts[op]} solves</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Suggested Practice ── */}
      {weakTopics.length > 0 && (
        <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}>
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Suggested Practice</h3>
          </div>
          <div className="space-y-2">
            {weakTopics.map(op => (
              <div key={op} className="rounded-xl p-3 flex items-start gap-3"
                style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}>
                <Target className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">Practice {TOPIC_LABELS[op] ?? op}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {op === "diff" || op === "integrate"
                      ? "Use the AI Solver with a calculus question or try Quiz Mode"
                      : op === "matrix"
                      ? "Try a matrix problem in the AI Solver"
                      : "Try solving 5 questions on this topic in the AI Solver or Quiz Mode"}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {setActiveTab && (
                    <>
                      <button onClick={() => setActiveTab("solver")}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold text-violet-300 transition-all hover:bg-violet-500/20 border border-violet-500/25">
                        Solve
                      </button>
                      <button onClick={() => setActiveTab("quiz")}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold text-violet-300 transition-all hover:bg-violet-500/20 border border-violet-500/25">
                        Quiz
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Badges ── */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Badges</h3>
          <span className="text-xs text-muted-foreground ml-1">{earnedBadges.length}/{BADGES.length} earned</span>
        </div>

        {earnedBadges.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {earnedBadges.map(b => (
              <motion.div key={b.id} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: b.bg, border: `1px solid ${b.border}` }}>
                <span className="text-xl shrink-0">{b.emoji}</span>
                <div className="min-w-0">
                  <p className={cn("text-xs font-bold truncate", b.color)}>{b.name}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug truncate">{b.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {earnedBadges.length === 0 && (
          <p className="text-xs text-muted-foreground">Solve your first problem to earn a badge!</p>
        )}

        {lockedBadges.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold border-t border-white/10 pt-3">Locked</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {lockedBadges.slice(0, 6).map(b => (
                <div key={b.id} className="rounded-xl p-3 flex items-center gap-3 opacity-40"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-muted-foreground truncate">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug truncate">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Quiz Performance ── */}
      {quizAnalytics && quizAnalytics.totalSessions > 0 && (
        <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quiz Performance</h3>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 text-center" style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)" }}>
              <p className="text-xl font-black text-yellow-300">{quizAnalytics.totalSessions}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Quizzes Taken</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <p className="text-xl font-black text-emerald-300">{Math.round(quizAnalytics.avgScore ?? 0)}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Avg Score</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
              <p className="text-xl font-black text-blue-300">{quizAnalytics.passRate ?? 0}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Pass Rate</p>
            </div>
          </div>

          {quizAnalytics.byTopic && Object.keys(quizAnalytics.byTopic).length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Topic Breakdown</p>
              {(Object.entries(quizAnalytics.byTopic) as [string, any][]).slice(0, 5).map(([topic, data]) => (
                <div key={topic} className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground w-32 truncate shrink-0 capitalize">{topic}</p>
                  <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.round(data.passRate ?? 0)}%`, background: (data.passRate ?? 0) >= 60 ? "rgba(52,211,153,0.7)" : "rgba(239,68,68,0.7)" }} />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-10 text-right shrink-0">{Math.round(data.passRate ?? 0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Recent History ── */}
      {history.length > 0 && (
        <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Problems</h3>
            <span className="text-xs text-muted-foreground ml-1">{history.length} total</span>
          </div>

          <div className="space-y-1.5">
            {history.slice(0, 8).map((h, i) => (
              <div key={h.id ?? i} className="flex items-center gap-3 rounded-xl px-3 py-2"
                style={{ background: "rgba(255,255,255,0.025)" }}>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                  style={{ background: "rgba(139,92,246,0.15)", color: "rgba(167,139,250,0.9)", border: "1px solid rgba(139,92,246,0.2)" }}>
                  {TOPIC_LABELS[h.operation] ? TOPIC_LABELS[h.operation].split("/")[0].trim() : (h.operation ?? "Solve")}
                </span>
                <p className="text-xs text-slate-300 flex-1 truncate font-mono">{h.expression ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(h.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isAuthenticated && (
        <div className="rounded-2xl p-5 text-center space-y-2" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)" }}>
          <Zap className="w-6 h-6 text-violet-400 mx-auto" />
          <p className="text-sm font-bold text-white">Sign in for Full Progress Tracking</p>
          <p className="text-xs text-muted-foreground">Save your XP, earn badges, and track your progress across sessions.</p>
        </div>
      )}
    </motion.div>
  );
}
