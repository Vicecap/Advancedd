import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Search, ChevronLeft, ChevronRight,
  Clock, Trophy, Star, Zap, Target, Play, CheckCircle2, XCircle,
  RotateCcw, Award, TrendingUp, Calendar, Flame, Brain, FileText,
  Loader2, AlertCircle, ChevronDown, ChevronUp, GraduationCap,
  BookMarked, Timer, Medal, Crown, BarChart3, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import PdfReader from "@/components/pdf-reader";

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

const SUBJECTS = [
  "Mathematics", "English Language", "Combined Science", "Biology",
  "Chemistry", "Physics", "History", "Geography", "Commerce",
  "Accounts", "Computer Science", "Religious Education",
];

const TOPICS: Record<string, string[]> = {
  "Mathematics": ["Algebra", "Geometry", "Trigonometry", "Statistics & Probability", "Calculus Basics", "Number Theory", "Quadratic Equations", "Linear Equations", "Fractions & Decimals", "Indices & Logarithms"],
  "English Language": ["Essay Writing", "Comprehension", "Grammar & Punctuation", "Summary Writing", "Vocabulary", "Letter Writing", "Report Writing", "Speech & Argument"],
  "Combined Science": ["Forces & Motion", "Energy", "Waves", "Electricity", "Chemical Reactions", "Atomic Structure", "Cells & Organisms", "Genetics"],
  "Biology": ["Cell Biology", "Genetics & Inheritance", "Ecosystems", "Human Body Systems", "Photosynthesis & Respiration", "Evolution", "Microorganisms"],
  "Chemistry": ["Atomic Structure", "Periodic Table", "Chemical Bonding", "Acids & Bases", "Oxidation & Reduction", "Organic Chemistry", "Stoichiometry"],
  "Physics": ["Mechanics", "Waves & Optics", "Electricity & Magnetism", "Thermodynamics", "Nuclear Physics", "Measurements"],
  "History": ["Colonial History", "Independence Movements", "World Wars", "Cold War", "African History", "Political Systems"],
  "Geography": ["Climate & Weather", "Landforms", "Population", "Resources", "Development", "Map Skills", "Natural Hazards"],
  "Commerce": ["Supply & Demand", "Business Types", "Banking & Finance", "Trade", "Insurance", "Marketing"],
  "Accounts": ["Double Entry", "Balance Sheet", "Income Statement", "Cash Flow", "Ledger Accounts", "Trial Balance"],
  "Computer Science": ["Algorithms", "Programming Basics", "Data Structures", "Networks", "Databases", "Binary & Hex"],
  "Religious Education": ["World Religions", "Ethics & Morals", "Sacred Texts", "Religious Practices", "Social Issues"],
};

type Level = "beginner" | "intermediate" | "advanced" | "expert";
type Duration = 15 | 30 | 60 | 120;
type ExamType = "quick" | "daily" | "weekly" | "monthly";
type ClassFilter = "all" | "baby" | "primary" | "top";
type View = "hub" | "materials" | "exam-config" | "generating" | "exam" | "results" | "history";

const LEVEL_LABELS: Record<Level, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert" };
const LEVEL_COLORS: Record<Level, string> = {
  beginner: "text-emerald-400", intermediate: "text-blue-400", advanced: "text-amber-400", expert: "text-rose-400",
};
const LEVEL_BG: Record<Level, string> = {
  beginner: "rgba(52,211,153,0.15)", intermediate: "rgba(96,165,250,0.15)", advanced: "rgba(251,191,36,0.15)", expert: "rgba(248,113,113,0.15)",
};
const LEVEL_BORDER: Record<Level, string> = {
  beginner: "rgba(52,211,153,0.3)", intermediate: "rgba(96,165,250,0.3)", advanced: "rgba(251,191,36,0.3)", expert: "rgba(248,113,113,0.3)",
};
const LEVEL_QUESTIONS: Record<Level, number> = { beginner: 5, intermediate: 10, advanced: 15, expert: 20 };
const LEVEL_XP_BASE: Record<Level, number> = { beginner: 50, intermediate: 100, advanced: 200, expert: 400 };
const DURATION_LABELS: Record<Duration, string> = { 15: "15 min", 30: "30 min", 60: "1 hour", 120: "2 hours" };
const PASS_THRESHOLD = 50;

// ── Types & API Shape ────────────────────────────────────────────────────────

interface ApiItem {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  type: string;
  subject: string | null;
  category: string | null;
  publisher: string | null;
  grade_level: string | null;
  formats: {
    pdf: string | null;
    epub: string | null;
    txt: string | null;
    html: string | null;
  };
}

interface PdfItem {
  id: string;
  title: string;
  pdf: string;
  description: string;
  source: string;
}

interface ExamQuestion { q: string; opts: string[]; ans: string; exp: string; }

interface ExamConfig {
  type: ExamType; subject: string; topic: string; level: Level;
  duration: Duration; numQuestions: number; label: string; model?: string;
}

const FREE_EXAM_MODELS = ["qwen2.5:7b", "qwen2.5:latest", "llama3.2:3b"];
function isFreeExamModel(m?: string) { return !!m && FREE_EXAM_MODELS.includes(m); }

interface ExamAttempt {
  id: string; config: ExamConfig; questions: ExamQuestion[];
  answers: (string | null)[]; score: number; total: number;
  passed: boolean; xpEarned: number; timestamp: number; timeUsed: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalisePdf(raw: ApiItem): PdfItem {
  return {
    id: raw.id || genId(),
    title: raw.title,
    pdf: raw.formats?.pdf ?? "",
    description: raw.description ?? raw.grade_level ?? "",
    source: raw.publisher ?? "General",
  };
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function getScheduledConfig(type: "daily" | "weekly" | "monthly"): ExamConfig {
  const now = new Date();
  let seed: number;
  if (type === "daily") {
    seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  } else if (type === "weekly") {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const week = Math.floor((now.getTime() - startOfYear.getTime()) / (7 * 86400000));
    seed = now.getFullYear() * 1000 + week;
  } else {
    seed = now.getFullYear() * 100 + now.getMonth() + 1;
  }

  const subjectIdx = seed % SUBJECTS.length;
  const subject = SUBJECTS[subjectIdx];
  const topics = TOPICS[subject] ?? ["General Topics"];
  const topicIdx = (seed * 3 + 7) % topics.length;
  const topic = topics[topicIdx];

  const levels: Level[] = ["beginner", "intermediate", "advanced", "expert"];
  const level = type === "daily" ? levels[seed % 3] : type === "weekly" ? levels[(seed % 3) + 1] : "expert";
  const duration: Duration = type === "daily" ? 30 : type === "weekly" ? 60 : 120;

  return {
    type, subject, topic, level, duration,
    numQuestions: LEVEL_QUESTIONS[level],
    label: type === "daily" ? "Daily Challenge" : type === "weekly" ? "Weekly Challenge" : "Monthly Exam",
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getGrade(pct: number): { grade: string; color: string } {
  if (pct >= 90) return { grade: "A+", color: "text-emerald-400" };
  if (pct >= 80) return { grade: "A", color: "text-emerald-400" };
  if (pct >= 70) return { grade: "B", color: "text-blue-400" };
  if (pct >= 60) return { grade: "C", color: "text-yellow-400" };
  if (pct >= 50) return { grade: "D", color: "text-amber-500" };
  return { grade: "F", color: "text-rose-400" };
}

function saveAttempt(attempt: ExamAttempt) {
  try {
    const existing = JSON.parse(localStorage.getItem("sh_attempts") ?? "[]") as ExamAttempt[];
    existing.unshift(attempt);
    localStorage.setItem("sh_attempts", JSON.stringify(existing.slice(0, 50)));
  } catch { }
}

function loadAttempts(): ExamAttempt[] {
  try {
    return JSON.parse(localStorage.getItem("sh_attempts") ?? "[]") as ExamAttempt[];
  } catch { return []; }
}

// ── Study Materials Section ───────────────────────────────────────────────────

function StudyMaterials({ onBack }: { onBack: () => void }) {
  const { isAuthenticated } = useAuth();
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PdfItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; title: string } | null>(null);
  const LIMIT = 20;

  const fetchPdfs = useCallback(async (p: number, cls: ClassFilter, q: string, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      let url = api(`/study-pdfs?page=${p}&limit=${LIMIT}`);
      if (cls !== "all") url += `&class=${cls}`;
      if (q.trim()) url += `&search=${encodeURIComponent(q.trim())}`;
      const res = await fetch(url);
      const data = await res.json();

      let newItems: PdfItem[] = [];

      // Handle paginated response { success, data, pagination }
      if (data && data.data && Array.isArray(data.data)) {
        newItems = (data.data as ApiItem[]).map(normalisePdf);
        setTotal(data.pagination?.total ?? (append ? total + newItems.length : newItems.length));
        setHasMore(data.pagination?.has_next ?? false);
      } else if (Array.isArray(data)) {
        // Fallback for raw arrays
        newItems = (data as ApiItem[]).map(normalisePdf);
        setTotal(append ? prev => prev + newItems.length : newItems.length);
        setHasMore(newItems.length === LIMIT);
      }

      // Basic local filtering for missing titles/PDFs
      const clean = newItems.filter(d => d.title && !d.title.endsWith(".ini") && d.pdf);

      setItems(prev => append ? [...prev, ...clean] : clean);
    } catch {
      if (!append) setItems([]);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [total]);

  useEffect(() => {
    setPage(1);
    setItems([]);
    fetchPdfs(1, classFilter, search);
  }, [classFilter, search, fetchPdfs]);

  const handleSearch = () => {
    setSearch(searchInput);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPdfs(next, classFilter, search, true);
  };

  const classBadge = (desc: string) => {
    const d = desc.toLowerCase();
    if (d.includes("baby")) return { label: "Baby Class", color: "text-pink-400", bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.3)" };
    if (d.includes("primary") || d.includes("p.1") || d.includes("p1")) return { label: "Primary", color: "text-blue-400", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.3)" };
    if (d.includes("top")) return { label: "Top Class", color: "text-amber-400", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)" };
    return { label: "Notes", color: "text-emerald-400", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)" };
  };

  const CLASS_TABS: { id: ClassFilter; label: string; emoji: string }[] = [
    { id: "all", label: "All", emoji: "📚" },
    { id: "baby", label: "Baby Class", emoji: "🍼" },
    { id: "primary", label: "Primary", emoji: "✏️" },
    { id: "top", label: "Top Class", emoji: "⭐" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/8 transition-colors border border-white/8">
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div>
          <h2 className="text-lg font-display font-bold text-white">Study Materials</h2>
          <p className="text-xs text-muted-foreground">{total > 0 ? total.toLocaleString() : items.length} documents available</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Search documents, subjects, topics…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400/40 transition-colors placeholder:text-muted-foreground/60"
          />
        </div>
        <button onClick={handleSearch} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.35)" }}>
          Search
        </button>
      </div>

      {/* Class Filters */}
      <div className="flex flex-wrap gap-2">
        {CLASS_TABS.map(c => (
          <button key={c.id} onClick={() => setClassFilter(c.id)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all",
              classFilter === c.id ? "text-white border" : "text-muted-foreground border border-white/8 hover:text-white hover:bg-white/5")}
            style={classFilter === c.id ? { background: "rgba(251,191,36,0.18)", borderColor: "rgba(251,191,36,0.4)" } : {}}>
            <span>{c.emoji}</span>{c.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading && page === 1 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No documents found.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map((item, i) => {
              const badge = classBadge(item.description || item.title);
              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (i % 20) * 0.02 }}
                  className="rounded-xl p-3.5 flex flex-col gap-2 group"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: badge.bg, border: `1px solid ${badge.border}` }}>
                      <FileText className={cn("w-3.5 h-3.5", badge.color)} />
                    </div>
                    <p className="text-[12px] font-medium text-white/90 leading-snug line-clamp-3 flex-1">{item.title}</p>
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}` }}>
                      {badge.label}
                    </span>
                    <button
                      onClick={() => {
                        if (!isAuthenticated) {
                          window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "pdf" } }));
                          return;
                        }
                        setPdfViewer({ url: item.pdf, title: item.title });
                      }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition-colors">
                      Read <BookOpen className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4 pb-8">
              <button onClick={loadMore} disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)" }}>
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Inline PDF Viewer (full-screen, proxied) ── */}
      <AnimatePresence>
        {pdfViewer && (
          <PdfReader
            url={`/api/external-pdf?url=${encodeURIComponent(pdfViewer.url)}`}
            title={pdfViewer.title}
            subtitle="Study Material"
            accentColor="#fbbf24"
            onClose={() => setPdfViewer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Exam Config Section ───────────────────────────────────────────────────────

function ExamConfig({ onBack, onStart }: { onBack: () => void; onStart: (cfg: ExamConfig) => void }) {
  const [examType, setExamType] = useState<ExamType>("quick");
  const [level, setLevel] = useState<Level>("intermediate");
  const [duration, setDuration] = useState<Duration>(30);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [topic, setTopic] = useState(TOPICS[SUBJECTS[0]][0]);
  const [aiModel, setAiModel] = useState("qwen2.5:7b");

  const dailyCfg = getScheduledConfig("daily");
  const weeklyCfg = getScheduledConfig("weekly");
  const monthlyCfg = getScheduledConfig("monthly");

  const handleStart = () => {
    if (examType === "quick") {
      onStart({ type: "quick", subject, topic, level, duration, numQuestions: LEVEL_QUESTIONS[level], label: `${LEVEL_LABELS[level]} Exam`, model: aiModel });
    } else {
      const cfg = examType === "daily" ? dailyCfg : examType === "weekly" ? weeklyCfg : monthlyCfg;
      onStart({ ...cfg, model: aiModel });
    }
  };

  const EXAM_TYPES = [
    { id: "quick" as ExamType, label: "Quick Exam", desc: "Custom topic & settings", icon: "⚡", color: "rgba(139,92,246,0.18)", border: "rgba(139,92,246,0.35)" },
    { id: "daily" as ExamType, label: "Daily Challenge", desc: `${dailyCfg.subject} · ${dailyCfg.topic}`, icon: "🔥", color: "rgba(251,146,60,0.18)", border: "rgba(251,146,60,0.35)" },
    { id: "weekly" as ExamType, label: "Weekly Challenge", desc: `${weeklyCfg.subject} · ${weeklyCfg.topic}`, icon: "📅", color: "rgba(96,165,250,0.18)", border: "rgba(96,165,250,0.35)" },
    { id: "monthly" as ExamType, label: "Monthly Exam", desc: `${monthlyCfg.subject} · ${monthlyCfg.topic}`, icon: "🏆", color: "rgba(234,179,8,0.18)", border: "rgba(234,179,8,0.35)" },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/8 transition-colors border border-white/8">
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div>
          <h2 className="text-lg font-display font-bold text-white">Configure Exam</h2>
          <p className="text-xs text-muted-foreground">Choose your exam type and settings</p>
        </div>
      </div>

      {/* Exam Type */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exam Type</p>
        <div className="grid grid-cols-2 gap-2">
          {EXAM_TYPES.map(t => (
            <button key={t.id} onClick={() => setExamType(t.id)}
              className={cn("p-3 rounded-xl text-left transition-all border", examType === t.id ? "border-opacity-100" : "border-white/8 hover:border-white/15")}
              style={examType === t.id ? { background: t.color, borderColor: t.border } : { background: "rgba(255,255,255,0.03)" }}>
              <div className="flex items-start gap-2">
                <span className="text-lg">{t.icon}</span>
                <div>
                  <p className="text-[13px] font-bold text-white">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{t.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick exam settings */}
      <AnimatePresence>
        {examType === "quick" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden">

            {/* Level */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Difficulty Level</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(LEVEL_LABELS) as Level[]).map(l => (
                  <button key={l} onClick={() => setLevel(l)}
                    className={cn("p-3 rounded-xl text-left transition-all border", level === l ? "border-opacity-100" : "border-white/8 hover:border-white/15")}
                    style={level === l ? { background: LEVEL_BG[l], borderColor: LEVEL_BORDER[l] } : { background: "rgba(255,255,255,0.03)" }}>
                    <div>
                      <p className={cn("text-[13px] font-bold", LEVEL_COLORS[l])}>{LEVEL_LABELS[l]}</p>
                      <p className="text-[11px] text-muted-foreground">{LEVEL_QUESTIONS[l]} questions · {LEVEL_XP_BASE[l]} XP</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time Limit</p>
              <div className="flex flex-wrap gap-2">
                {([15, 30, 60, 120] as Duration[]).map(d => (
                  <button key={d} onClick={() => setDuration(d)}
                    className={cn("px-4 py-2 rounded-xl text-[13px] font-semibold transition-all border", duration === d ? "text-white" : "text-muted-foreground border-white/8 hover:text-white hover:bg-white/5")}
                    style={duration === d ? { background: "rgba(99,102,241,0.2)", borderColor: "rgba(99,102,241,0.4)", color: "#c4b5fd" } : {}}>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {DURATION_LABELS[d]}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject</p>
              <select value={subject} onChange={e => { setSubject(e.target.value); setTopic(TOPICS[e.target.value][0]); }}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-400/40">
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Topic */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Topic</p>
              <select value={topic} onChange={e => setTopic(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-400/40">
                {(TOPICS[subject] ?? ["General"]).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scheduled exam info */}
      {examType !== "quick" && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          {(() => {
            const cfg = examType === "daily" ? dailyCfg : examType === "weekly" ? weeklyCfg : monthlyCfg;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <p className="text-sm font-semibold text-white">AI will generate this exam</p>
                </div>
                <p className="text-xs text-muted-foreground">Subject: <span className="text-white">{cfg.subject}</span></p>
                <p className="text-xs text-muted-foreground">Topic: <span className="text-white">{cfg.topic}</span></p>
                <p className="text-xs text-muted-foreground">Level: <span className={LEVEL_COLORS[cfg.level]}>{LEVEL_LABELS[cfg.level]}</span></p>
                <p className="text-xs text-muted-foreground">Duration: <span className="text-white">{DURATION_LABELS[cfg.duration]}</span> · {cfg.numQuestions} questions</p>
                <p className="text-xs text-muted-foreground">XP on pass: <span className="text-yellow-400">+{LEVEL_XP_BASE[cfg.level]} XP</span></p>
              </div>
            );
          })()}
        </div>
      )}

      {/* AI Model Selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Model for Generation</p>
        <select value={aiModel} onChange={e => setAiModel(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <optgroup label="Free Models">
            <option value="qwen2.5:7b">Qwen 2.5 7B — Free</option>
            <option value="qwen2.5:latest">Qwen 2.5 — Free</option>
            <option value="llama3.2:3b">Llama 3.2 3B — Free</option>
          </optgroup>
          <optgroup label="Premium Models">
            <option value="qwen/qwq-32b">Qwen QwQ 32B — Best Quality</option>
            <option value="qwen/qwen3.5-122b-a10b">Qwen 122B — High Quality</option>
            <option value="qwen/qwen3.5-9b">Qwen 9B — Fast</option>
          </optgroup>
        </select>
        {isFreeExamModel(aiModel) && (
          <p className="text-[10px] text-emerald-400/80">Free model — no tokens charged</p>
        )}
      </div>

      <button onClick={handleStart} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[15px] font-bold text-white transition-all"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.4))", border: "1px solid rgba(99,102,241,0.5)" }}>
        <Play className="w-5 h-5" />
        Generate Exam with AI
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StudyHallTab() {
  const { isAuthenticated } = useAuth();
  const [view, setView] = useState<View>("hub");
  const [examConfig, setExamConfig] = useState<ExamConfig | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [genError, setGenError] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [examResult, setExamResult] = useState<ExamAttempt | null>(null);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [reviewOpen, setReviewOpen] = useState<number | null>(null);
  const [showAllReview, setShowAllReview] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    setAttempts(loadAttempts());
  }, []);

  // Timer logic
  useEffect(() => {
    if (timerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            setTimerRunning(false);
            handleTimeUp();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const handleTimeUp = () => {
    submitExam(true);
  };

  const submitExam = useCallback((timedOut = false) => {
    if (!examConfig || questions.length === 0) return;
    const finalAnswers = timedOut ? answers : answers;
    const score = questions.filter((q, i) => finalAnswers[i] === q.ans).length;
    const total = questions.length;
    const pct = Math.round((score / total) * 100);
    const passed = pct >= PASS_THRESHOLD;
    const timeUsed = examConfig.duration * 60 - timeLeft;

    let xp = passed ? LEVEL_XP_BASE[examConfig.level] : Math.round(LEVEL_XP_BASE[examConfig.level] * 0.25);
    if (pct >= 80) xp += Math.round(LEVEL_XP_BASE[examConfig.level] * 0.5);
    if (pct === 100) xp += 100;
    if (examConfig.type === "daily") xp += 50;
    if (examConfig.type === "weekly") xp += 100;
    if (examConfig.type === "monthly") xp += 200;

    const attempt: ExamAttempt = {
      id: genId(), config: examConfig, questions, answers: finalAnswers,
      score, total, passed, xpEarned: xp, timestamp: Date.now(), timeUsed,
    };

    saveAttempt(attempt);
    setExamResult(attempt);
    setAttempts(loadAttempts());
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);

    // Award XP to backend if authenticated
    if (isAuthenticated && xp > 0) {
      fetch(api("/xp/earn"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: Math.min(xp, 500), source: `exam:${examConfig.type}:${examConfig.subject}` }),
      }).catch(() => { });
    }

    setView("results");
  }, [examConfig, questions, answers, timeLeft, isAuthenticated]);

  const startExam = (cfg: ExamConfig) => {
    setExamConfig(cfg);
    setGenError("");
    setView("generating");
    generateQuestions(cfg);
  };

  const generateQuestions = async (cfg: ExamConfig) => {
    const numQ = cfg.numQuestions;
    const diffMap: Record<Level, string> = {
      beginner: "easy, straightforward",
      intermediate: "moderate, O-Level standard",
      advanced: "challenging, A-Level entry",
      expert: "very hard, distinction level",
    };

    const prompt = `You are a ZIMSEC and Cambridge O-Level exam setter. Generate exactly ${numQ} multiple-choice questions for ${cfg.subject} on the topic "${cfg.topic}". Difficulty: ${diffMap[cfg.level]}.
RULES:
- Each question must have exactly 4 options labeled A, B, C, D
- Exactly one correct answer
- Include a brief explanation (1-2 sentences) for the correct answer
- Questions should be suitable for secondary school students
- Mix recall, application, and analysis questions
RESPOND WITH ONLY VALID JSON, NO MARKDOWN, NO EXTRA TEXT:
[{"q":"question text","opts":["A. option","B. option","C. option","D. option"],"ans":"A","exp":"explanation"}]`;

    try {
      const model = cfg.model ?? "qwen/qwq-32b";
      const endpoint = isFreeExamModel(model) ? api("/free-ai/discuss") : api("/discuss");
      const body = isFreeExamModel(model)
        ? { messages: [{ role: "user", content: prompt }], model }
        : { prompt, model };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("AI request failed");

      const data = await res.json();
      const text: string = data.response ?? data.content ?? data.text ?? "";

      // Parse JSON from response
      let parsed: ExamQuestion[] = [];
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as ExamQuestion[];
      } else {
        parsed = JSON.parse(text) as ExamQuestion[];
      }

      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("No questions generated");

      // Normalise
      const valid = parsed
        .filter(q => q.q && q.opts && q.ans)
        .slice(0, numQ)
        .map(q => ({
          q: q.q,
          opts: q.opts.slice(0, 4),
          ans: q.ans.toUpperCase().charAt(0),
          exp: q.exp ?? "",
        }));

      if (valid.length === 0) throw new Error("Questions could not be parsed");

      setQuestions(valid);
      setAnswers(new Array(valid.length).fill(null));
      setCurrentQ(0);
      setTimeLeft(cfg.duration * 60);
      startTimeRef.current = Date.now();
      setTimerRunning(true);
      setView("exam");
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Failed to generate questions. Please try again.");
      setView("exam-config");
    }
  };

  // ── Hub View ──────────────────────────────────────────────────────────────

  if (view === "hub") {
    const recentAttempts = attempts.slice(0, 3);
    const passRate = attempts.length > 0 ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100) : 0;
    const totalXp = attempts.reduce((s, a) => s + a.xpEarned, 0);

    return (
      <div className="space-y-6">
        {/* Hero */}
        <div className="rounded-2xl p-5 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(99,102,241,0.1) 100%)", border: "1px solid rgba(251,191,36,0.2)" }}>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🎓</span>
              <h1 className="font-display font-black text-2xl text-white">Study Hall & Exam Centre</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-lg">
              Browse 20,000+ study materials, take AI-generated timed exams, earn XP and track your progress.
            </p>
          </div>
        </div>

        {/* Stats strip */}
        {attempts.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Exams Taken", value: attempts.length, icon: GraduationCap, color: "text-indigo-400", bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.2)" },
              { label: "Pass Rate", value: `${passRate}%`, icon: Trophy, color: "text-emerald-400", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.2)" },
              { label: "XP Earned", value: totalXp.toLocaleString(), icon: Zap, color: "text-yellow-400", bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.2)" },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.color)} />
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Study Materials */}
          <button onClick={() => setView("materials")}
            className="rounded-2xl p-5 text-left transition-all group hover:scale-[1.01]"
            style={{ background: "linear-gradient(135deg, rgba(96,165,250,0.1), rgba(99,102,241,0.08))", border: "1px solid rgba(96,165,250,0.2)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
              style={{ background: "rgba(96,165,250,0.2)", border: "1px solid rgba(96,165,250,0.3)" }}>
              <BookMarked className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="font-display font-bold text-lg text-white mb-1">Study Materials</h3>
            <p className="text-sm text-muted-foreground mb-3">Browse 20,000+ documents — Baby Class, Primary & Top Class notes and past papers.</p>
            <div className="flex items-center gap-1.5 text-[12px] text-blue-400 font-semibold">
              Browse library <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>

          {/* Exam Hall */}
          <button onClick={() => setView("exam-config")}
            className="rounded-2xl p-5 text-left transition-all group hover:scale-[1.01]"
            style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(251,146,60,0.08))", border: "1px solid rgba(251,191,36,0.2)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
              style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.3)" }}>
              <Timer className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="font-display font-bold text-lg text-white mb-1">Exam Hall</h3>
            <p className="text-sm text-muted-foreground mb-3">AI-generated timed exams — Daily, Weekly, Monthly challenges or custom sessions with XP rewards.</p>
            <div className="flex items-center gap-1.5 text-[12px] text-amber-400 font-semibold">
              Start exam <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>

        {/* Scheduled Exams Preview */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" /> Today's Scheduled Exams
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(["daily", "weekly", "monthly"] as const).map(type => {
              const cfg = getScheduledConfig(type);
              const icons = { daily: "🔥", weekly: "📅", monthly: "🏆" };
              const colors = { daily: "rgba(251,146,60,0.12)", weekly: "rgba(96,165,250,0.12)", monthly: "rgba(234,179,8,0.12)" };
              const borders = { daily: "rgba(251,146,60,0.25)", weekly: "rgba(96,165,250,0.25)", monthly: "rgba(234,179,8,0.25)" };
              const xpBonus = { daily: 50, weekly: 100, monthly: 200 };
              return (
                <button key={type} onClick={() => { setView("exam-config"); }}
                  className="rounded-xl p-3 text-left transition-all hover:opacity-90"
                  style={{ background: colors[type], border: `1px solid ${borders[type]}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span>{icons[type]}</span>
                    <p className="text-[12px] font-bold text-white capitalize">{type} Challenge</p>
                    <span className="ml-auto text-[10px] font-bold text-yellow-400">+{xpBonus[type]} XP bonus</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{cfg.subject} · {cfg.topic}</p>
                  <p className="text-[11px] text-muted-foreground">{LEVEL_LABELS[cfg.level]} · {DURATION_LABELS[cfg.duration]}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Results */}
        {recentAttempts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Results</p>
              <button onClick={() => setView("history")} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">View all →</button>
            </div>
            <div className="space-y-2">
              {recentAttempts.map(a => {
                const pct = Math.round((a.score / a.total) * 100);
                const { grade, color } = getGrade(pct);
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0", color)}
                      style={{ background: a.passed ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)" }}>
                      {grade}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-white truncate">{a.config.subject} · {a.config.topic}</p>
                      <p className="text-[11px] text-muted-foreground">{a.score}/{a.total} correct · {pct}%</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-bold text-yellow-400">+{a.xpEarned} XP</p>
                      <p className={cn("text-[10px] font-semibold", a.passed ? "text-emerald-400" : "text-rose-400")}>{a.passed ? "PASS" : "FAIL"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Materials View ─────────────────────────────────────────────────────────

  if (view === "materials") {
    return <StudyMaterials onBack={() => setView("hub")} />;
  }

  // ── Exam Config View ───────────────────────────────────────────────────────

  if (view === "exam-config") {
    return (
      <div className="space-y-4">
        <ExamConfig onBack={() => setView("hub")} onStart={startExam} />
        {genError && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-rose-400"
            style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)" }}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {genError}
          </div>
        )}
      </div>
    );
  }

  // ── Generating View ────────────────────────────────────────────────────────

  if (view === "generating") {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 py-16 space-y-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
          <Brain className="w-8 h-8 text-indigo-400 animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-display font-bold text-white">AI is preparing your exam…</h3>
          <p className="text-sm text-muted-foreground">
            Generating {examConfig?.numQuestions} questions on {examConfig?.subject} · {examConfig?.topic}
          </p>
          <p className="text-xs text-indigo-400">{examConfig && LEVEL_LABELS[examConfig.level]} level · {examConfig && DURATION_LABELS[examConfig.duration]}</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Exam View ──────────────────────────────────────────────────────────────

  if (view === "exam" && questions.length > 0 && examConfig) {
    const q = questions[currentQ];
    const pctTime = Math.round((timeLeft / (examConfig.duration * 60)) * 100);
    const timerColor = pctTime > 30 ? "text-emerald-400" : pctTime > 10 ? "text-amber-400" : "text-rose-400";
    const timerBg = pctTime > 30 ? "rgba(52,211,153,0.1)" : pctTime > 10 ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.1)";
    const timerBorder = pctTime > 30 ? "rgba(52,211,153,0.25)" : pctTime > 10 ? "rgba(251,191,36,0.25)" : "rgba(248,113,113,0.35)";
    const answered = answers.filter(a => a !== null).length;

    return (
      <div className="space-y-4 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{examConfig.subject} · {examConfig.topic}</p>
            <p className="text-[13px] text-white font-semibold">{LEVEL_LABELS[examConfig.level]} · {examConfig.numQuestions} questions</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: timerBg, border: `1px solid ${timerBorder}` }}>
            <Clock className={cn("w-4 h-4", timerColor)} />
            <span className={cn("font-mono text-lg font-bold", timerColor)}>{formatTime(timeLeft)}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Question {currentQ + 1} of {questions.length}</span>
            <span>{answered} answered</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/8">
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${((currentQ + 1) / questions.length) * 100}%`, background: "linear-gradient(90deg, rgba(99,102,241,0.8), rgba(139,92,246,1))" }} />
          </div>
        </div>

        {/* Question */}
        <AnimatePresence mode="wait">
          <motion.div key={currentQ} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <p className="text-[15px] font-semibold text-white leading-relaxed">{q.q}</p>
            <div className="space-y-2">
              {q.opts.map((opt, oi) => {
                const letter = ["A", "B", "C", "D"][oi];
                const selected = answers[currentQ] === letter;
                return (
                  <button key={oi} onClick={() => {
                    const newAns = [...answers];
                    newAns[currentQ] = letter;
                    setAnswers(newAns);
                  }}
                    className={cn("w-full text-left px-4 py-3 rounded-xl transition-all border text-sm font-medium",
                      selected ? "text-white" : "text-muted-foreground hover:text-white hover:bg-white/5")}
                    style={selected ? { background: "rgba(99,102,241,0.25)", borderColor: "rgba(99,102,241,0.55)" } : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
                    <span className={cn("font-bold mr-2", selected ? "text-indigo-300" : "text-muted-foreground")}>{letter}.</span>
                    {opt.replace(/^[A-D]\.\s*/, "")}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Question Navigator */}
        <div className="flex flex-wrap gap-1.5">
          {questions.map((_, i) => (
            <button key={i} onClick={() => setCurrentQ(i)}
              className={cn("w-8 h-8 rounded-lg text-xs font-bold transition-all border",
                i === currentQ ? "text-white" : answers[i] ? "text-emerald-400" : "text-muted-foreground hover:text-white")}
              style={{
                background: i === currentQ ? "rgba(99,102,241,0.3)" : answers[i] ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                borderColor: i === currentQ ? "rgba(99,102,241,0.5)" : answers[i] ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.07)",
              }}>
              {i + 1}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          <button onClick={() => setCurrentQ(q => Math.max(0, q - 1))} disabled={currentQ === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground border border-white/8 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          {currentQ < questions.length - 1 ? (
            <button onClick={() => setCurrentQ(q => q + 1)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => submitExam(false)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.35), rgba(16,185,129,0.25))", border: "1px solid rgba(52,211,153,0.45)" }}>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Submit Exam
            </button>
          )}
        </div>

        {/* Submit early */}
        {currentQ < questions.length - 1 && answered === questions.length && (
          <button onClick={() => submitExam(false)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.3), rgba(16,185,129,0.2))", border: "1px solid rgba(52,211,153,0.4)" }}>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Submit All Answers
          </button>
        )}
      </div>
    );
  }

  // ── Results View ───────────────────────────────────────────────────────────

  if (view === "results" && examResult) {
    const a = examResult;
    const pct = Math.round((a.score / a.total) * 100);
    const { grade, color } = getGrade(pct);
    const mins = Math.floor(a.timeUsed / 60);
    const secs = a.timeUsed % 60;

    return (
      <div className="space-y-5 max-w-2xl">
        {/* Score Card */}
        <div className="rounded-2xl p-6 text-center relative overflow-hidden"
          style={{ background: a.passed ? "linear-gradient(135deg, rgba(52,211,153,0.12), rgba(16,185,129,0.08))" : "linear-gradient(135deg, rgba(248,113,113,0.12), rgba(239,68,68,0.08))", border: `1px solid ${a.passed ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}` }}>
          <div className={cn("text-6xl font-display font-black mb-1", color)}>{grade}</div>
          <p className="text-2xl font-bold text-white">{pct}%</p>
          <p className="text-sm text-muted-foreground">{a.score} / {a.total} correct</p>
          <div className={cn("inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full text-sm font-bold", a.passed ? "text-emerald-400" : "text-rose-400")}
            style={{ background: a.passed ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)", border: `1px solid ${a.passed ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}` }}>
            {a.passed ? <><Trophy className="w-4 h-4" /> PASSED</> : <><XCircle className="w-4 h-4" /> FAILED</>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)" }}>
            <p className="text-lg font-bold text-yellow-400">+{a.xpEarned}</p>
            <p className="text-[10px] text-muted-foreground">XP Earned</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
            <p className="text-lg font-bold text-indigo-400">{mins}:{secs.toString().padStart(2, "0")}</p>
            <p className="text-[10px] text-muted-foreground">Time Used</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)" }}>
            <p className="text-lg font-bold text-emerald-400">{LEVEL_LABELS[a.config.level]}</p>
            <p className="text-[10px] text-muted-foreground">Level</p>
          </div>
        </div>

        {/* XP & Badges earned */}
        {a.passed && (
          <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
            <Sparkles className="w-5 h-5 text-yellow-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-yellow-400">🎉 +{a.xpEarned} XP awarded!</p>
              <p className="text-xs text-muted-foreground">
                {a.config.type !== "quick" ? `${a.config.label} bonus included · ` : ""}
                {pct >= 80 ? "Excellence bonus +50% · " : ""}{pct === 100 ? "Perfect score +100 XP · " : ""}
                Check My Progress for badges.
              </p>
            </div>
          </div>
        )}

        {/* Question Review */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Answer Review</p>
            <button onClick={() => setShowAllReview(v => !v)} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
              {showAllReview ? "Collapse" : "Expand all"} {showAllReview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {a.questions.map((q, i) => {
            const userAns = a.answers[i];
            const correct = userAns === q.ans;
            const isOpen = showAllReview || reviewOpen === i;

            return (
              <div key={i} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${correct ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`, background: correct ? "rgba(52,211,153,0.05)" : "rgba(248,113,113,0.05)" }}>
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setReviewOpen(reviewOpen === i ? null : i)}>
                  {correct ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <p className="text-[13px] font-medium text-white flex-1 line-clamp-1">{q.q}</p>
                  <span className={cn("text-[11px] font-bold shrink-0", correct ? "text-emerald-400" : "text-rose-400")}>{correct ? "✓" : "✗"}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 space-y-2 border-t border-white/5">
                    {q.opts.map((opt, oi) => {
                      const letter = ["A", "B", "C", "D"][oi];
                      const isCorrect = letter === q.ans;
                      const isUser = letter === userAns;
                      return (
                        <div key={oi} className={cn("flex items-start gap-2 text-[12px] px-2 py-1 rounded-lg",
                          isCorrect ? "text-emerald-300" : isUser && !isCorrect ? "text-rose-300 line-through" : "text-muted-foreground")}
                          style={isCorrect ? { background: "rgba(52,211,153,0.08)" } : isUser && !isCorrect ? { background: "rgba(248,113,113,0.08)" } : {}}>
                          <span className="font-bold shrink-0">{letter}.</span>
                          <span>{opt.replace(/^[A-D]\.\s*/, "")}</span>
                          {isCorrect && <span className="ml-auto shrink-0 text-emerald-400 font-bold">✓ correct</span>}
                          {isUser && !isCorrect && <span className="ml-auto shrink-0 text-rose-400 font-bold">✗ your answer</span>}
                        </div>
                      );
                    })}
                    {q.exp && <p className="text-[11px] text-indigo-300 italic px-2 pt-1 border-t border-white/5">💡 {q.exp}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button onClick={() => { setView("exam-config"); setExamResult(null); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>
            <RotateCcw className="w-4 h-4" /> New Exam
          </button>
          <button onClick={() => setView("hub")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground border border-white/8 hover:text-white hover:bg-white/5 transition-all">
            <ChevronLeft className="w-4 h-4" /> Back to Hub
          </button>
        </div>
      </div>
    );
  }

  // ── History View ───────────────────────────────────────────────────────────

  if (view === "history") {
    const passCount = attempts.filter(a => a.passed).length;
    const passRate = attempts.length > 0 ? Math.round((passCount / attempts.length) * 100) : 0;
    const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + Math.round((a.score / a.total) * 100), 0) / attempts.length) : 0;
    const totalXp = attempts.reduce((s, a) => s + a.xpEarned, 0);

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("hub")} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/8 transition-colors border border-white/8">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div>
            <h2 className="text-lg font-display font-bold text-white">Exam History</h2>
            <p className="text-xs text-muted-foreground">{attempts.length} exams taken</p>
          </div>
        </div>

        {/* Summary */}
        {attempts.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total", value: attempts.length, color: "text-indigo-400", bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.2)" },
              { label: "Pass Rate", value: `${passRate}%`, color: "text-emerald-400", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.2)" },
              { label: "Avg Score", value: `${avgScore}%`, color: "text-blue-400", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.2)" },
              { label: "Total XP", value: totalXp.toLocaleString(), color: "text-yellow-400", bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.2)" },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {attempts.length === 0 ? (
          <div className="text-center py-16">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">No exams taken yet. Start your first exam!</p>
            <button onClick={() => setView("exam-config")} className="mt-4 px-6 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>
              Take an Exam
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {attempts.map(a => {
              const pct = Math.round((a.score / a.total) * 100);
              const { grade, color } = getGrade(pct);
              const dt = a.timestamp ? new Date(a.timestamp) : new Date();
              const formattedDate = isNaN(dt.getTime()) ? "Unknown Date" : dt.toLocaleDateString();

              return (
                <div key={a.id} className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0", color)}
                    style={{ background: a.passed ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)" }}>
                    {grade}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate">{a.config.subject} · {a.config.topic}</p>
                    <p className="text-[11px] text-muted-foreground">{a.score}/{a.total} · {LEVEL_LABELS[a.config.level]} · {formattedDate}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-yellow-400">+{a.xpEarned} XP</p>
                    <p className={cn("text-[10px] font-semibold", a.passed ? "text-emerald-400" : "text-rose-400")}>{a.passed ? "PASS" : "FAIL"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}
