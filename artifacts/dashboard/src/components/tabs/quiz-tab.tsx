import React, { useState, useEffect, useRef } from "react";
import {
  GraduationCap, Dices, Globe, Database, Flame, Trophy, Zap,
  BarChart3, CheckCircle2, XCircle, RotateCcw,
  Clock, Target, TrendingUp, Award, Calendar, BookOpen,
  ArrowLeft, Play, Sparkles, Crown, Medal, User, Hash, AlertCircle,
  ChevronDown, ChevronUp, Shuffle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { decodeHTMLEntities } from "@/lib/utils";
import {
  fetchOTDBQuestions, fetchTriviaAPIQuestions,
  useQuizCategories, TRIVIA_API_CATEGORIES, type NormalisedQuestion,
} from "@/hooks/use-quiz-api";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(path: string) { return `${BASE_URL}api${path}`; }

type View = "home" | "exam" | "results" | "random" | "leaderboard" | "analytics";
type QuizSource = "opentdb" | "trivia-api";
type ExamSize = 5 | 10 | 15 | 20;

interface PlayerProfile { id: string; displayName: string; }
interface ExamConfig {
  size: ExamSize; source: QuizSource; categoryId: string; categoryLabel: string;
  difficulty: string; isDaily: boolean; topic: string;
}
interface AnswerRecord { choice: string | null; correct: boolean; }

function genUUID(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getPlayer(): PlayerProfile {
  try {
    const raw = localStorage.getItem("quiz_player");
    if (raw) return JSON.parse(raw);
  } catch {}
  const p: PlayerProfile = { id: genUUID(), displayName: "Anonymous" };
  localStorage.setItem("quiz_player", JSON.stringify(p));
  return p;
}
function savePlayer(p: PlayerProfile) { localStorage.setItem("quiz_player", JSON.stringify(p)); }

const PASS_THRESHOLD = 60;
const XP_PER_CORRECT = 10;
const DIFFICULTY_MULT: Record<string, number> = { easy: 1, medium: 1.5, hard: 2, any: 1.2 };
const SIZE_MULT: Record<number, number> = { 5: 1, 10: 1.2, 15: 1.4, 20: 1.6 };
function calcXP(correct: number, total: number, difficulty: string, isDaily: boolean) {
  const diff = DIFFICULTY_MULT[difficulty] ?? 1;
  const sizeMult = SIZE_MULT[total] ?? 1;
  let xp = Math.round(correct * XP_PER_CORRECT * diff * sizeMult);
  if (total > 0 && correct === total) xp += 50;
  if (isDaily) xp += 100;
  return xp;
}

const RANK_COLORS = ["text-yellow-400", "text-slate-300", "text-amber-600"];
const RANK_ICONS = [Crown, Medal, Award];

function RankIcon({ rank }: { rank: number }) {
  if (rank > 2) return <span className="text-sm font-mono text-muted-foreground w-6 text-center">{rank + 1}</span>;
  const Icon = RANK_ICONS[rank];
  return <Icon className={cn("w-5 h-5 shrink-0", RANK_COLORS[rank])} />;
}

export default function QuizTab() {
  const [view, setView] = useState<View>("home");
  const [player, setPlayer] = useState<PlayerProfile>(() => getPlayer());
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(player.displayName);

  const [source, setSource] = useState<QuizSource>("opentdb");
  const [otdbCategory, setOtdbCategory] = useState("");
  const [triviaCategory, setTriviaCategory] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [examSize, setExamSize] = useState<ExamSize>(10);

  const [questions, setQuestions] = useState<NormalisedQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [loadingExam, setLoadingExam] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [resultsData, setResultsData] = useState<{ xpEarned: number; scorePct: number; passed: boolean } | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [leaderboard, setLeaderboard] = useState<{ allTime: any[]; weekly: any[]; monthly: any[] } | null>(null);
  const [lbTab, setLbTab] = useState<"allTime" | "weekly" | "monthly">("allTime");
  const [lbLoading, setLbLoading] = useState(false);

  const [analytics, setAnalytics] = useState<any | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [dailyChallenge, setDailyChallenge] = useState<any | null>(null);

  const [randSource, setRandSource] = useState<QuizSource>("opentdb");
  const [randOtdbCat, setRandOtdbCat] = useState("");
  const [randTriviaCat, setRandTriviaCat] = useState("");
  const [randDifficulty, setRandDifficulty] = useState("");
  const [randQuestion, setRandQuestion] = useState<NormalisedQuestion | null>(null);
  const [randChoices, setRandChoices] = useState<string[]>([]);
  const [randSelected, setRandSelected] = useState<string | null>(null);
  const [randLoading, setRandLoading] = useState(false);
  const [randError, setRandError] = useState<string | null>(null);
  const [randScore, setRandScore] = useState({ correct: 0, total: 0 });
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  const { data: otdbCategories } = useQuizCategories();

  useEffect(() => {
    fetch(api("/quiz/daily-challenge")).then(r => r.json()).then(setDailyChallenge).catch(() => {});
    initPlayer(player);
  }, []);

  async function initPlayer(p: PlayerProfile) {
    try {
      const res = await fetch(api("/quiz/player/init"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: p.id, displayName: p.displayName }),
      });
      if (res.ok) { const data = await res.json(); setPlayer(data); savePlayer(data); }
    } catch {}
  }

  async function saveName() {
    if (!nameInput.trim()) return;
    const updated = { ...player, displayName: nameInput.trim().slice(0, 50) };
    setPlayer(updated); savePlayer(updated); setEditingName(false);
    await fetch(api("/quiz/player/init"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: updated.id, displayName: updated.displayName }),
    }).catch(() => {});
  }

  function startTimer(seconds: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current!); return 0; } return t - 1; });
    }, 1000);
  }

  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }

  const getTimePerQ = (diff: string) => diff === "hard" ? 45 : diff === "easy" ? 90 : 60;

  async function startExam(config: ExamConfig) {
    setLoadingExam(true); setLoadError(null);
    try {
      let qs: NormalisedQuestion[] = [];
      if (config.source === "opentdb") {
        qs = await fetchOTDBQuestions(config.categoryId, config.difficulty === "any" ? "" : config.difficulty, "", config.size + 5);
      } else {
        qs = await fetchTriviaAPIQuestions(config.categoryId, config.difficulty, config.size + 5);
      }
      if (!qs.length) throw new Error("No questions returned. Try different settings.");
      const shuffled = qs.sort(() => Math.random() - 0.5).slice(0, config.size);
      const firstQ = shuffled[0];
      const firstChoices = firstQ.type === "boolean"
        ? ["True", "False"]
        : [...firstQ.incorrect_answers, firstQ.correct_answer].sort(() => Math.random() - 0.5);

      setQuestions(shuffled);
      setChoices(firstChoices.map(decodeHTMLEntities));
      setCurrent(0); setAnswers([]); setSelected(null);
      setExamConfig(config);
      setResultsData(null); setReviewOpen(false);
      setView("exam");
      startTimer(getTimePerQ(config.difficulty) * config.size);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoadingExam(false);
    }
  }

  function handleAnswer(choice: string) {
    if (selected || !questions[current]) return;
    setSelected(choice);
    stopTimer();
    const correct = choice === decodeHTMLEntities(questions[current].correct_answer);
    const newAnswers = [...answers, { choice, correct }];
    setAnswers(newAnswers);

    setTimeout(() => {
      if (current + 1 < questions.length) {
        const nextQ = questions[current + 1];
        const nextChoices = nextQ.type === "boolean"
          ? ["True", "False"]
          : [...nextQ.incorrect_answers, nextQ.correct_answer].sort(() => Math.random() - 0.5);
        setChoices(nextChoices.map(decodeHTMLEntities));
        setCurrent(c => c + 1);
        setSelected(null);
        startTimer(getTimePerQ(examConfig?.difficulty ?? "medium"));
      } else {
        stopTimer();
        finishExam(newAnswers);
      }
    }, 1200);
  }

  function skipQuestion() {
    if (!questions[current] || selected) return;
    stopTimer();
    const newAnswers = [...answers, { choice: null, correct: false }];
    setAnswers(newAnswers);
    if (current + 1 < questions.length) {
      const nextQ = questions[current + 1];
      const nextChoices = nextQ.type === "boolean"
        ? ["True", "False"]
        : [...nextQ.incorrect_answers, nextQ.correct_answer].sort(() => Math.random() - 0.5);
      setChoices(nextChoices.map(decodeHTMLEntities));
      setCurrent(c => c + 1); setSelected(null);
      startTimer(getTimePerQ(examConfig?.difficulty ?? "medium"));
    } else {
      finishExam(newAnswers);
    }
  }

  async function finishExam(finalAnswers: AnswerRecord[]) {
    if (!examConfig) return;
    stopTimer();
    const correct = finalAnswers.filter(a => a.correct).length;
    const scorePct = Math.round((correct / examConfig.size) * 100);
    const passed = scorePct >= PASS_THRESHOLD;
    const xpEarned = calcXP(correct, examConfig.size, examConfig.difficulty, examConfig.isDaily);
    setResultsData({ xpEarned, scorePct, passed });
    setView("results");

    setSavingResult(true);
    try {
      await fetch(api("/quiz/session/complete"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          playerId: player.id, topic: examConfig.topic, source: examConfig.source,
          difficulty: examConfig.difficulty, totalQuestions: examConfig.size,
          correct, isDailyChallenge: examConfig.isDaily,
        }),
      });
      window.dispatchEvent(new CustomEvent("xp-updated"));
    } catch {}
    setSavingResult(false);
  }

  async function loadLeaderboard() {
    setLbLoading(true);
    try {
      const res = await fetch(api("/quiz/leaderboard"));
      if (res.ok) setLeaderboard(await res.json());
    } catch {}
    setLbLoading(false);
  }

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(api(`/quiz/analytics/${player.id}`));
      if (res.ok) setAnalytics(await res.json());
    } catch {}
    setAnalyticsLoading(false);
  }

  async function loadRandomQuestion() {
    setRandLoading(true); setRandError(null); setRandSelected(null);
    setExplanation(null); setExplainError(null);
    try {
      let qs: NormalisedQuestion[] = [];
      if (randSource === "opentdb") {
        qs = await fetchOTDBQuestions(randOtdbCat, randDifficulty, "", 15);
      } else {
        qs = await fetchTriviaAPIQuestions(randTriviaCat, randDifficulty, 15);
      }
      if (!qs.length) throw new Error("No questions returned. Try different settings.");
      const q = qs[Math.floor(Math.random() * qs.length)];
      const c = q.type === "boolean"
        ? ["True", "False"]
        : [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
      setRandQuestion(q);
      setRandChoices(c.map(decodeHTMLEntities));
    } catch (e) { setRandError((e as Error).message); }
    finally { setRandLoading(false); }
  }

  function handleRandAnswer(choice: string) {
    if (!randQuestion || randSelected) return;
    setRandSelected(choice);
    const correct = choice === decodeHTMLEntities(randQuestion.correct_answer);
    setRandScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
  }

  async function askExplanation() {
    if (!randQuestion) return;
    setExplaining(true); setExplainError(null); setExplanation(null);
    try {
      const res = await fetch(api("/quiz/explain"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: decodeHTMLEntities(randQuestion.question),
          correctAnswer: decodeHTMLEntities(randQuestion.correct_answer),
          userAnswer: randSelected ?? undefined,
          category: randQuestion.category,
          difficulty: randQuestion.difficulty,
          isCorrect: randSelected === decodeHTMLEntities(randQuestion.correct_answer),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get explanation");
      setExplanation(data.explanation);
    } catch (e) { setExplainError((e as Error).message); }
    finally { setExplaining(false); }
  }

  useEffect(() => {
    if (view === "leaderboard" && !leaderboard) loadLeaderboard();
    if (view === "analytics") loadAnalytics();
  }, [view]);

  const correct = answers.filter(a => a.correct).length;
  const scorePct = examConfig ? Math.round((correct / examConfig.size) * 100) : 0;
  const passed = scorePct >= PASS_THRESHOLD;

  const categoryLabel = source === "opentdb"
    ? (otdbCategories?.find(c => String(c.id) === otdbCategory)?.name ?? "Any Category")
    : (TRIVIA_API_CATEGORIES.find(c => c.value === triviaCategory)?.label ?? "Any Category");

  const DIFF_OPTIONS = [
    { v: "easy", label: "Easy", color: "text-emerald-400" },
    { v: "medium", label: "Medium", color: "text-yellow-400" },
    { v: "hard", label: "Hard", color: "text-red-400" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="max-w-4xl mx-auto space-y-4"
    >
      {/* Top nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { v: "home" as View, icon: GraduationCap, label: "Exam Mode", activeFor: ["home", "exam", "results"] },
          { v: "random" as View, icon: Shuffle, label: "Random Quiz", activeFor: ["random"] },
          { v: "leaderboard" as View, icon: Trophy, label: "Leaderboard", activeFor: ["leaderboard"] },
          { v: "analytics" as View, icon: BarChart3, label: "My Stats", activeFor: ["analytics"] },
        ].map(({ v, icon: Icon, label, activeFor }) => {
          const active = activeFor.includes(view);
          return (
            <button key={v} onClick={() => setView(v)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all border",
                active ? "text-white border-violet-500/60" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white"
              )}
              style={active ? { background: "rgba(139,92,246,0.2)" } : { background: "rgba(255,255,255,0.03)" }}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input value={nameInput} onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                className="px-2 py-1 rounded-lg text-xs text-white bg-white/10 border border-white/20 focus:outline-none w-32"
                maxLength={50} autoFocus />
              <button onClick={saveName} className="p-1 rounded hover:bg-white/10"><CheckCircle2 className="w-4 h-4 text-emerald-400" /></button>
              <button onClick={() => setEditingName(false)} className="p-1 rounded hover:bg-white/10"><XCircle className="w-4 h-4 text-muted-foreground" /></button>
            </div>
          ) : (
            <button onClick={() => { setNameInput(player.displayName); setEditingName(true); }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all"
              style={{ background: "rgba(255,255,255,0.03)" }}>
              <User className="w-3.5 h-3.5" />{player.displayName}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ═══════════════ HOME / SETUP ═══════════════ */}
        {view === "home" && (
          <motion.div key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-4">
            {/* Daily Challenge */}
            {dailyChallenge && (
              <div className="rounded-2xl p-4 md:p-5 cursor-pointer group transition-all hover:scale-[1.01]"
                style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.08) 100%)", border: "1px solid rgba(251,191,36,0.3)" }}
                onClick={() => startExam({
                  size: 10, source: dailyChallenge.source as QuizSource,
                  categoryId: dailyChallenge.categoryId, categoryLabel: dailyChallenge.topic,
                  difficulty: dailyChallenge.difficulty, isDaily: true, topic: dailyChallenge.topic,
                })}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl shrink-0" style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)" }}>
                    <Calendar className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider text-yellow-400">Daily Challenge</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-yellow-400"
                        style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)" }}>+100 XP Bonus</span>
                    </div>
                    <p className="text-sm font-semibold text-white mt-0.5 truncate">{dailyChallenge.topic}</p>
                    <p className="text-xs text-muted-foreground capitalize">{dailyChallenge.difficulty} · 10 questions</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-yellow-300 shrink-0 group-hover:scale-105 transition-transform"
                    style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)" }}>
                    <Play className="w-4 h-4" /> Play
                  </div>
                </div>
              </div>
            )}

            {/* Exam Builder */}
            <div className="rounded-2xl p-4 md:p-5 space-y-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="p-2.5 rounded-xl" style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.35)" }}>
                  <GraduationCap className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Build Your Exam</h2>
                  <p className="text-xs text-muted-foreground">Choose size, topic, and difficulty</p>
                </div>
              </div>

              {/* Exam Size */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Questions per Exam</p>
                <div className="grid grid-cols-4 gap-2">
                  {([5, 10, 15, 20] as ExamSize[]).map(n => (
                    <button key={n} onClick={() => setExamSize(n)}
                      className={cn("py-3 rounded-xl text-sm font-bold transition-all border flex flex-col items-center gap-1",
                        examSize === n ? "text-white border-violet-500/60" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white"
                      )}
                      style={examSize === n ? { background: "rgba(139,92,246,0.2)" } : { background: "rgba(255,255,255,0.03)" }}>
                      <span className="text-lg">{n}</span>
                      <span className="text-[10px] opacity-70">{n === 5 ? "Quick" : n === 10 ? "Standard" : n === 15 ? "Extended" : "Full Exam"}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Source + Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Source</p>
                  <div className="flex gap-2">
                    {(["opentdb", "trivia-api"] as QuizSource[]).map(s => (
                      <button key={s} onClick={() => setSource(s)}
                        className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-1 justify-center transition-all border",
                          source === s ? "text-white border-violet-500/60" : "text-muted-foreground border-white/10 hover:border-white/20"
                        )}
                        style={source === s ? { background: "rgba(139,92,246,0.2)" } : { background: "rgba(255,255,255,0.03)" }}>
                        {s === "opentdb" ? <Database className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                        {s === "opentdb" ? "Open Trivia" : "Trivia API"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Topic / Category</p>
                  {source === "opentdb" ? (
                    <select value={otdbCategory} onChange={e => setOtdbCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm text-white focus:outline-none transition-all"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      <option value="">Any Category</option>
                      {otdbCategories?.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                  ) : (
                    <select value={triviaCategory} onChange={e => setTriviaCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm text-white focus:outline-none transition-all"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      <option value="">Any Category</option>
                      {TRIVIA_API_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Difficulty</p>
                <div className="flex gap-2">
                  {DIFF_OPTIONS.map(({ v, label, color }) => (
                    <button key={v} onClick={() => setDifficulty(v)}
                      className={cn("px-4 py-2 rounded-xl text-sm font-semibold flex-1 transition-all border",
                        difficulty === v ? `${color} border-current/40` : "text-muted-foreground border-white/10 hover:border-white/20"
                      )}
                      style={difficulty === v ? { background: "rgba(255,255,255,0.08)" } : { background: "rgba(255,255,255,0.03)" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* XP Preview */}
              <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                <div className="text-xs text-muted-foreground">
                  <span className="text-white font-semibold">Perfect score</span> earns up to
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="font-bold text-yellow-300">{calcXP(examSize, examSize, difficulty, false)} XP</span>
                </div>
              </div>

              {loadError && (
                <div className="flex items-center gap-2 text-red-400 text-sm p-3 rounded-xl border border-red-500/20" style={{ background: "rgba(239,68,68,0.08)" }}>
                  <AlertCircle className="w-4 h-4 shrink-0" />{loadError}
                </div>
              )}

              <button
                onClick={() => startExam({
                  size: examSize, source, categoryId: source === "opentdb" ? otdbCategory : triviaCategory,
                  categoryLabel, difficulty, isDaily: false, topic: categoryLabel,
                })}
                disabled={loadingExam}
                className="w-full py-3 rounded-xl font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.7), rgba(109,40,217,0.7))", border: "1px solid rgba(139,92,246,0.5)" }}>
                {loadingExam ? (
                  <><span className="animate-spin">⌛</span> Loading questions…</>
                ) : (
                  <><Play className="w-5 h-5" /> Start {examSize}-Question Exam</>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* ═══════════════ EXAM ═══════════════ */}
        {view === "exam" && examConfig && questions[current] && (
          <motion.div key="exam" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="space-y-4">
            {/* Exam header */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center gap-3 mb-3">
                <button onClick={() => { stopTimer(); setView("home"); }}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-all text-muted-foreground hover:text-white">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-white">{examConfig.topic}</span>
                    {examConfig.isDaily && <span className="text-[10px] px-2 py-0.5 rounded-full text-yellow-400 font-semibold" style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)" }}>Daily +100XP</span>}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{examConfig.difficulty} · {examConfig.source === "opentdb" ? "Open Trivia DB" : "The Trivia API"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">Question</p>
                  <p className="text-sm font-bold text-white">{current + 1} / {examConfig.size}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <motion.div className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.8), rgba(59,130,246,0.8))" }}
                  animate={{ width: `${((current + 1) / examConfig.size) * 100}%` }}
                  transition={{ duration: 0.4 }} />
              </div>

              {/* Timer + score mini */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1.5">
                  <Clock className={cn("w-3.5 h-3.5", timeLeft <= 10 ? "text-red-400" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-mono font-semibold", timeLeft <= 10 ? "text-red-400" : "text-muted-foreground")}>{timeLeft}s</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400">{answers.filter(a => a.correct).length} correct</span>
                </div>
              </div>
            </div>

            {/* Question card */}
            <AnimatePresence mode="wait">
              <motion.div key={current}
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl p-5 md:p-6"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="text-xs text-muted-foreground">{decodeHTMLEntities(questions[current].category)}</span>
                  <span className="text-white/20">·</span>
                  <span className={cn("text-xs font-semibold capitalize",
                    questions[current].difficulty === "easy" ? "text-emerald-400"
                    : questions[current].difficulty === "medium" ? "text-yellow-400" : "text-red-400")}>
                    {questions[current].difficulty}
                  </span>
                </div>
                <h3 className="text-lg md:text-xl font-semibold text-white mb-6 text-center leading-relaxed">
                  {decodeHTMLEntities(questions[current].question)}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {choices.map((c, i) => {
                    const isCorrect = c === decodeHTMLEntities(questions[current].correct_answer);
                    const isSelected = c === selected;
                    let style: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };
                    let textCls = "text-white";
                    if (selected) {
                      if (isCorrect) { style = { background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.5)" }; textCls = "text-emerald-300"; }
                      else if (isSelected) { style = { background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.5)" }; textCls = "text-red-300"; }
                      else { style = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }; textCls = "text-slate-500"; }
                    }
                    return (
                      <button key={i} onClick={() => handleAnswer(c)} disabled={!!selected}
                        className={cn("p-4 rounded-xl text-left font-medium text-base transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-default", textCls)}
                        style={style}>
                        <span className="mr-2 font-mono text-sm opacity-60">{String.fromCharCode(65 + i)}.</span>{c}
                      </button>
                    );
                  })}
                </div>

                {selected && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className={cn("mt-4 p-3 rounded-xl text-center text-sm font-bold border",
                      selected === decodeHTMLEntities(questions[current].correct_answer)
                        ? "text-emerald-400 border-emerald-500/30"
                        : "text-red-400 border-red-500/30"
                    )}
                    style={selected === decodeHTMLEntities(questions[current].correct_answer)
                      ? { background: "rgba(16,185,129,0.1)" } : { background: "rgba(239,68,68,0.1)" }}>
                    {selected === decodeHTMLEntities(questions[current].correct_answer)
                      ? "✓ Correct! Next question coming…"
                      : `✗ Incorrect — correct: ${decodeHTMLEntities(questions[current].correct_answer)}`}
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>

            <button onClick={skipQuestion} disabled={!!selected}
              className="w-full py-2 rounded-xl text-sm text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all disabled:opacity-30">
              Skip question →
            </button>
          </motion.div>
        )}

        {/* ═══════════════ RESULTS ═══════════════ */}
        {view === "results" && examConfig && resultsData && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="space-y-4">
            {/* Score hero */}
            <div className={cn("rounded-2xl p-6 text-center")}
              style={{
                background: passed
                  ? "linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.08) 100%)"
                  : "linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(185,28,28,0.08) 100%)",
                border: `1px solid ${passed ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}`,
              }}>
              <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl font-black",
                passed ? "text-emerald-400" : "text-red-400"
              )}
                style={{ background: passed ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `2px solid ${passed ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}` }}>
                {scorePct}%
              </div>
              <h2 className={cn("text-2xl font-black mb-1", passed ? "text-emerald-400" : "text-red-400")}>
                {passed ? "🎉 Passed!" : "❌ Failed"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {correct} / {examConfig.size} correct · {examConfig.topic} · {examConfig.difficulty}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Pass mark: {PASS_THRESHOLD}%</p>

              <div className="flex items-center justify-center gap-2 mt-4">
                <Zap className="w-5 h-5 text-yellow-400" />
                <span className="text-xl font-black text-yellow-300">+{resultsData.xpEarned} XP earned</span>
              </div>
              {savingResult && <p className="text-xs text-muted-foreground mt-2">Saving result…</p>}
            </div>

            {/* Score breakdown */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Correct", value: correct, color: "text-emerald-400", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)" },
                { label: "Wrong", value: answers.filter(a => !a.correct && a.choice !== null).length, color: "text-red-400", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)" },
                { label: "Skipped", value: answers.filter(a => a.choice === null).length, color: "text-muted-foreground", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)" },
              ].map(({ label, value, color, bg, border }) => (
                <div key={label} className="rounded-xl p-3 text-center" style={{ background: bg, border: `1px solid ${border}` }}>
                  <p className={cn("text-2xl font-black", color)}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* Question review */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <button onClick={() => setReviewOpen(r => !r)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-all">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-white">Review Answers</span>
                </div>
                {reviewOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              <AnimatePresence>
                {reviewOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t border-white/10">
                    <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                      {questions.slice(0, answers.length).map((q, i) => {
                        const a = answers[i];
                        return (
                          <div key={i} className="rounded-xl p-3 text-sm" style={{
                            background: a.correct ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                            border: `1px solid ${a.correct ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                          }}>
                            <p className="font-medium text-white mb-1"><span className="text-muted-foreground mr-2">Q{i + 1}.</span>{decodeHTMLEntities(q.question)}</p>
                            {a.choice !== null ? (
                              <p className={a.correct ? "text-emerald-400 text-xs" : "text-red-400 text-xs"}>
                                Your answer: {a.choice} {a.correct ? "✓" : "✗"}
                              </p>
                            ) : <p className="text-muted-foreground text-xs">Skipped</p>}
                            {!a.correct && <p className="text-emerald-400 text-xs mt-0.5">Correct: {decodeHTMLEntities(q.correct_answer)}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex gap-3">
              <button onClick={() => startExam(examConfig!)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                style={{ background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.45)" }}>
                <RotateCcw className="w-4 h-4" /> Retry Same Exam
              </button>
              <button onClick={() => setView("home")}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Dices className="w-4 h-4" /> New Exam
              </button>
            </div>
            <button onClick={() => setView("leaderboard")}
              className="w-full py-2 rounded-xl text-sm text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2">
              <Trophy className="w-4 h-4" /> View Leaderboard
            </button>
          </motion.div>
        )}

        {/* ═══════════════ RANDOM QUIZ ═══════════════ */}
        {view === "random" && (
          <motion.div key="random" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">
            <div className="rounded-2xl p-4 md:p-5 space-y-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="p-2.5 rounded-xl" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>
                  <Shuffle className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-bold text-white">Random Quiz</h2>
                  <p className="text-xs text-muted-foreground">One question at a time · Ask AI to explain any answer</p>
                </div>
                {randScore.total > 0 && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Session</p>
                    <p className="text-lg font-black text-emerald-400">{randScore.correct}<span className="text-muted-foreground text-sm font-normal">/{randScore.total}</span></p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Source</p>
                  <div className="flex gap-2">
                    {(["opentdb", "trivia-api"] as QuizSource[]).map(s => (
                      <button key={s} onClick={() => { setRandSource(s); setRandQuestion(null); setRandSelected(null); }}
                        className={cn("flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold flex-1 justify-center border transition-all",
                          randSource === s ? "text-white border-indigo-500/50" : "text-muted-foreground border-white/10 hover:border-white/20"
                        )}
                        style={randSource === s ? { background: "rgba(99,102,241,0.2)" } : { background: "rgba(255,255,255,0.03)" }}>
                        {s === "opentdb" ? <Database className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                        {s === "opentdb" ? "Open Trivia" : "Trivia API"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Category</p>
                  {randSource === "opentdb" ? (
                    <select value={randOtdbCat} onChange={e => setRandOtdbCat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs text-white focus:outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      <option value="">Any</option>
                      {otdbCategories?.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                  ) : (
                    <select value={randTriviaCat} onChange={e => setRandTriviaCat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs text-white focus:outline-none"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      <option value="">Any</option>
                      {TRIVIA_API_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Difficulty</p>
                  <select value={randDifficulty} onChange={e => setRandDifficulty(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs text-white focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                    <option value="">Any</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              <button onClick={loadRandomQuestion} disabled={randLoading}
                className="w-full py-2.5 rounded-xl font-bold text-white text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.45)" }}>
                {randLoading
                  ? <><span className="animate-spin">⌛</span> Loading…</>
                  : <><Dices className="w-4 h-4" />{randQuestion ? "Next Question" : "Load Question"}</>
                }
              </button>

              {randError && (
                <div className="flex items-center gap-2 text-red-400 text-sm p-3 rounded-xl border border-red-500/20"
                  style={{ background: "rgba(239,68,68,0.08)" }}>
                  <AlertCircle className="w-4 h-4 shrink-0" />{randError}
                </div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {randQuestion && (
                <motion.div key={randQuestion.question}
                  initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-2xl p-5 space-y-4"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">{decodeHTMLEntities(randQuestion.category)}</span>
                    <span className="text-white/20">·</span>
                    <span className={cn("text-xs font-semibold capitalize",
                      randQuestion.difficulty === "easy" ? "text-emerald-400"
                      : randQuestion.difficulty === "medium" ? "text-yellow-400" : "text-red-400")}>
                      {randQuestion.difficulty}
                    </span>
                    <span className="text-white/20">·</span>
                    <span className="text-xs text-muted-foreground">{randQuestion.source === "opentdb" ? "Open Trivia DB" : "The Trivia API"}</span>
                  </div>

                  <h3 className="text-lg md:text-xl font-semibold text-white text-center leading-relaxed">
                    {decodeHTMLEntities(randQuestion.question)}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {randChoices.map((c, i) => {
                      const isCorrect = c === decodeHTMLEntities(randQuestion.correct_answer);
                      const isSelected = c === randSelected;
                      let style: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };
                      let textCls = "text-white";
                      if (randSelected) {
                        if (isCorrect) { style = { background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.5)" }; textCls = "text-emerald-300"; }
                        else if (isSelected) { style = { background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.5)" }; textCls = "text-red-300"; }
                        else { style = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }; textCls = "text-slate-500"; }
                      }
                      return (
                        <button key={i} onClick={() => handleRandAnswer(c)} disabled={!!randSelected}
                          className={cn("p-4 rounded-xl text-left font-medium text-base transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-default", textCls)}
                          style={style}>
                          <span className="mr-2 font-mono text-sm opacity-60">{String.fromCharCode(65 + i)}.</span>{c}
                        </button>
                      );
                    })}
                  </div>

                  {randSelected && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      <div className={cn("p-3 rounded-xl text-center text-sm font-bold border",
                        randSelected === decodeHTMLEntities(randQuestion.correct_answer)
                          ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"
                        )}
                        style={randSelected === decodeHTMLEntities(randQuestion.correct_answer)
                          ? { background: "rgba(16,185,129,0.1)" } : { background: "rgba(239,68,68,0.1)" }}>
                        {randSelected === decodeHTMLEntities(randQuestion.correct_answer)
                          ? "✓ Correct!"
                          : `✗ Incorrect — correct answer: ${decodeHTMLEntities(randQuestion.correct_answer)}`}
                      </div>

                      {/* AI Explain button */}
                      {!explanation && !explaining && (
                        <button onClick={askExplanation}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                          style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.2))", border: "1px solid rgba(139,92,246,0.4)" }}>
                          <Sparkles className="w-4 h-4 text-violet-400" />
                          <span className="text-white">Explain with AI</span>
                          <span className="text-[10px] text-muted-foreground bg-violet-500/15 border border-violet-500/25 px-2 py-0.5 rounded-full ml-1">Qwen 122B</span>
                        </button>
                      )}

                      {explaining && (
                        <div className="flex items-center justify-center gap-2 py-3 text-sm text-violet-300"
                          style={{ background: "rgba(139,92,246,0.08)", borderRadius: "12px", border: "1px solid rgba(139,92,246,0.2)" }}>
                          <Sparkles className="w-4 h-4 animate-pulse" />
                          Qwen 122B is thinking…
                        </div>
                      )}

                      {explainError && (
                        <div className="flex items-center gap-2 text-red-400 text-xs p-3 rounded-xl border border-red-500/20"
                          style={{ background: "rgba(239,68,68,0.08)" }}>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{explainError}
                        </div>
                      )}

                      {explanation && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          className="rounded-xl p-4 space-y-2"
                          style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.07))", border: "1px solid rgba(139,92,246,0.25)" }}>
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                            <span className="text-xs font-semibold text-violet-300">AI Explanation · Qwen 3.5 122B</span>
                          </div>
                          <p className="text-sm text-slate-200 leading-relaxed">{explanation}</p>
                          <button onClick={askExplanation} className="text-xs text-muted-foreground hover:text-violet-300 transition-colors mt-1">
                            Regenerate ↺
                          </button>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ═══════════════ LEADERBOARD ═══════════════ */}
        {view === "leaderboard" && (
          <motion.div key="leaderboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">
            <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(245,158,11,0.06) 100%)", border: "1px solid rgba(251,191,36,0.25)" }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl" style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.35)" }}>
                  <Trophy className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Leaderboard</h2>
                  <p className="text-xs text-muted-foreground">XP rankings across all players</p>
                </div>
                <button onClick={loadLeaderboard} className="ml-auto p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-all">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-2 mb-4">
                {(["allTime", "weekly", "monthly"] as const).map(t => (
                  <button key={t} onClick={() => setLbTab(t)}
                    className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex-1",
                      lbTab === t ? "text-yellow-300 border-yellow-500/40" : "text-muted-foreground border-white/10 hover:border-white/20"
                    )}
                    style={lbTab === t ? { background: "rgba(251,191,36,0.15)" } : { background: "rgba(255,255,255,0.03)" }}>
                    {t === "allTime" ? "All Time" : t === "weekly" ? "This Week" : "This Month"}
                  </button>
                ))}
              </div>

              {lbLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <span className="animate-spin">⌛</span> Loading leaderboard…
                </div>
              ) : !leaderboard ? (
                <p className="text-center text-sm text-muted-foreground py-8">Could not load leaderboard</p>
              ) : (leaderboard[lbTab] as any[]).length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No results yet for this period. Be the first! 🏆</p>
              ) : (
                <div className="space-y-2">
                  {(leaderboard[lbTab] as any[]).map((entry: any, i: number) => (
                    <motion.div key={entry.playerId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                        entry.playerId === player.id ? "ring-1 ring-violet-500/40" : ""
                      )}
                      style={{
                        background: i === 0 ? "rgba(251,191,36,0.1)" : i === 1 ? "rgba(148,163,184,0.08)" : i === 2 ? "rgba(180,83,9,0.08)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${i === 0 ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.07)"}`,
                      }}>
                      <RankIcon rank={i} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {entry.displayName}
                          {entry.playerId === player.id && <span className="ml-1.5 text-[10px] text-violet-400">(you)</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{entry.sessions} exams · avg {entry.avgScore}%</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        <span className="font-black text-yellow-300 text-sm">{Number(entry.totalXP).toLocaleString()}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══════════════ ANALYTICS ═══════════════ */}
        {view === "analytics" && (
          <motion.div key="analytics" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl" style={{ background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)" }}>
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">My Stats</h2>
                  <p className="text-xs text-muted-foreground">{player.displayName}'s performance</p>
                </div>
                <button onClick={loadAnalytics} className="ml-auto p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-all">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {analyticsLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <span className="animate-spin">⌛</span> Loading stats…
                </div>
              ) : !analytics ? (
                <p className="text-center text-sm text-muted-foreground py-8">Could not load analytics</p>
              ) : analytics.totalSessions === 0 ? (
                <div className="text-center py-12">
                  <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-semibold text-white mb-1">No exams taken yet</p>
                  <p className="text-xs text-muted-foreground">Complete your first exam to see your stats here!</p>
                  <button onClick={() => setView("home")}
                    className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.45)" }}>
                    Start an Exam
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Key stats grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Total XP", value: Number(analytics.totalXP).toLocaleString(), icon: Zap, color: "text-yellow-400", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.25)" },
                      { label: "Streak", value: `${analytics.streak}d`, icon: Flame, color: "text-orange-400", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.25)" },
                      { label: "Avg Score", value: `${analytics.avgScore}%`, icon: Target, color: "text-blue-400", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.25)" },
                      { label: "Pass Rate", value: `${analytics.passRate}%`, icon: CheckCircle2, color: "text-emerald-400", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)" },
                    ].map(({ label, value, icon: Icon, color, bg, border }) => (
                      <div key={label} className="rounded-xl p-3 text-center" style={{ background: bg, border: `1px solid ${border}` }}>
                        <Icon className={cn("w-4 h-4 mx-auto mb-1", color)} />
                        <p className={cn("text-xl font-black", color)}>{value}</p>
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* XP progress */}
                  <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">XP Progress</p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {[
                        { label: "All Time", value: Number(analytics.totalXP).toLocaleString() },
                        { label: "This Week", value: Number(analytics.weeklyXP ?? 0).toLocaleString() },
                        { label: "This Month", value: Number(analytics.monthlyXP ?? 0).toLocaleString() },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-lg font-black text-violet-300">{value}</p>
                          <p className="text-[11px] text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Exams count */}
                  <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Exams Completed</p>
                        <p className="text-2xl font-black text-white">{analytics.totalSessions}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Passed</p>
                        <p className="text-2xl font-black text-emerald-400">
                          {analytics.recent?.filter((s: any) => s.passed).length ?? 0}
                          <span className="text-sm text-muted-foreground font-normal">/{Math.min(analytics.totalSessions, 20)} recent</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* By Topic */}
                  {analytics.byTopic?.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                      <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Topics</span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {analytics.byTopic.map((t: any) => (
                          <div key={t.topic} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white font-medium truncate">{t.topic}</p>
                              <p className="text-[11px] text-muted-foreground">{t.sessions} exam{t.sessions !== 1 ? "s" : ""} · {t.passed} passed</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-white">{t.avgScore}%</p>
                              <div className="flex items-center gap-1 justify-end">
                                <Zap className="w-3 h-3 text-yellow-400" />
                                <p className="text-[11px] text-yellow-300">{t.xp} XP</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* By Difficulty */}
                  {analytics.byDifficulty?.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                      <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By Difficulty</span>
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {analytics.byDifficulty.map((d: any) => {
                          const color = d.difficulty === "easy" ? "text-emerald-400" : d.difficulty === "medium" ? "text-yellow-400" : "text-red-400";
                          const bg = d.difficulty === "easy" ? "rgba(16,185,129,0.08)" : d.difficulty === "medium" ? "rgba(251,191,36,0.08)" : "rgba(239,68,68,0.08)";
                          const border = d.difficulty === "easy" ? "rgba(16,185,129,0.2)" : d.difficulty === "medium" ? "rgba(251,191,36,0.2)" : "rgba(239,68,68,0.2)";
                          return (
                            <div key={d.difficulty} className="rounded-xl p-3 text-center" style={{ background: bg, border: `1px solid ${border}` }}>
                              <p className={cn("font-bold capitalize mb-1", color)}>{d.difficulty}</p>
                              <p className="text-xl font-black text-white">{d.avgScore}%</p>
                              <p className="text-[11px] text-muted-foreground">{d.sessions} exam{d.sessions !== 1 ? "s" : ""}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Recent sessions */}
                  {analytics.recent?.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                      <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Exams</span>
                      </div>
                      <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                        {analytics.recent.slice(0, 15).map((s: any) => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className={cn("w-2 h-2 rounded-full shrink-0", s.passed ? "bg-emerald-400" : "bg-red-400")} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white font-medium truncate">{s.topic}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {s.totalQuestions}Q · {s.difficulty} · {new Date(s.completedAt).toLocaleDateString()}
                                {s.isDailyChallenge && <span className="ml-1 text-yellow-400">★ Daily</span>}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn("text-sm font-bold", s.passed ? "text-emerald-400" : "text-red-400")}>{parseFloat(s.scorePct).toFixed(0)}%</p>
                              <p className="text-[11px] text-yellow-300">+{s.xpEarned} XP</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
