import React, { useEffect, useState, useCallback } from "react";
import {
  X, User, Coins, Clock, Trash2, RefreshCw, Zap, Mail,
  ChevronLeft, Bot, Sparkles, Loader2, BookOpen, AlertCircle,
  BarChart3, TrendingUp, Star, Target, MessageSquare,
  Flame, ArrowUpRight, CheckCircle2, Library,
} from "lucide-react";
import { StreakCard } from "@/components/streak-card";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AuthUser, TokenInfo } from "@/hooks/use-auth";

interface Computation {
  id: number;
  expression: string;
  operation: string;
  result: string;
  isNumeric: boolean;
  numericValue: number | null;
  createdAt: string;
}

interface Resource {
  title: string;
  subject: string;
  category: string;
  year: number | null;
}

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  tokens: TokenInfo | null;
  onLogout: () => void;
  onOpenShop?: () => void;
}

const FREE_MODEL_IDS = new Set(["llama3.2:3b", "qwen2.5:latest", "qwen2.5:7b"]);

const MODELS = [
  { id: "qwen2.5:7b",                 label: "Qwen 2.5 7B",   sub: "Free · always available", recommended: false, free: true },
  { id: "qwen2.5:latest",             label: "Qwen 2.5",      sub: "Free · always available",  recommended: false, free: true },
  { id: "llama3.2:3b",               label: "Llama 3.2 3B",  sub: "Free · always available",  recommended: false, free: true },
  { id: "qwen/qwen3.5-9b",            label: "Qwen Fast",     sub: "Premium · quick answers",    recommended: false, free: false },
  { id: "qwen/qwen3.5-27b",           label: "Qwen Balanced", sub: "Premium · general use",      recommended: false, free: false },
  { id: "qwen/qwen3.5-122b-a10b",     label: "Qwen Powerful", sub: "Premium · complex problems", recommended: true,  free: false },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small", sub: "Premium · fast & precise", recommended: false, free: false },
  { id: "openai/gpt-5.4-mini",        label: "GPT-5.4 Mini",  sub: "Premium · OpenAI model",     recommended: false, free: false },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const OP_COLORS: Record<string, string> = {
  evaluate: "text-blue-400",
  solve: "text-purple-400",
  factor: "text-teal-400",
  expand: "text-green-400",
  simplify: "text-yellow-400",
  diff: "text-orange-400",
  integrate: "text-red-400",
  limit: "text-pink-400",
  homework: "text-violet-400",
};

const OP_BG: Record<string, string> = {
  evaluate: "bg-blue-500/10 border-blue-500/20",
  solve: "bg-purple-500/10 border-purple-500/20",
  factor: "bg-teal-500/10 border-teal-500/20",
  expand: "bg-green-500/10 border-green-500/20",
  simplify: "bg-yellow-500/10 border-yellow-500/20",
  diff: "bg-orange-500/10 border-orange-500/20",
  integrate: "bg-red-500/10 border-red-500/20",
  limit: "bg-pink-500/10 border-pink-500/20",
  homework: "bg-violet-500/10 border-violet-500/20",
};

function EntryDetail({
  entry,
  onBack,
}: {
  entry: Computation;
  onBack: () => void;
}) {
  const [model, setModel] = useState("qwen/qwen3.5-27b");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState("");

  const ask = async () => {
    if (loading) return;
    setLoading(true);
    setResponse("");
    setResources([]);
    setError("");

    const content = `Problem: ${entry.expression}\nOperation: ${entry.operation}\nResult: ${entry.result}`;
    const isFree = FREE_MODEL_IDS.has(model);

    try {
      if (isFree) {
        const res = await fetch("/api/free-ai/discuss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `${content}\n\nQuestion: ${question.trim() || "Explain this problem and its solution in detail, step by step."}`,
            model,
          }),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error || "Request failed");
        }
        const data = await res.json() as { response?: string; error?: string };
        setResponse(data.response ?? "");
        setResources([]);
      } else {
        const res = await fetch("/api/homework", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            question: question.trim() || "Explain this problem and its solution in detail, then find relevant study resources.",
            mode: "help",
            ai: model,
          }),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error || "Request failed");
        }
        const data = await res.json() as { response: string; relevantResources: Resource[] };
        setResponse(data.response);
        setResources(data.relevantResources ?? []);
      }
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="flex items-center gap-3 p-5 border-b border-white/10 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <span className={cn("text-xs font-bold uppercase tracking-wider", OP_COLORS[entry.operation] ?? "text-slate-400")}>
            {entry.operation}
          </span>
          <p className="text-sm text-white font-mono truncate">{entry.expression}</p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(entry.createdAt)}</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-5 space-y-4">

          {/* Problem card */}
          <div className={cn("rounded-xl border p-4", OP_BG[entry.operation] ?? "bg-white/5 border-white/10")}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Problem</p>
            <p className="text-sm text-white font-mono break-all">{entry.expression}</p>
            <div className="mt-2 pt-2 border-t border-white/10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Result</p>
              <p className="text-sm text-white font-mono break-all">{entry.result}</p>
            </div>
          </div>

          {/* AI section */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" /> Ask AI about this
            </p>

            {/* Model picker */}
            <div className="grid grid-cols-1 gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 px-1 pt-0.5">Free models</p>
              {MODELS.filter(m => m.free).map(m => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={[
                    "flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all duration-150 text-xs",
                    model === m.id ? "text-white" : "border-white/8 text-muted-foreground hover:text-white hover:border-white/15",
                  ].join(" ")}
                  style={model === m.id
                    ? { background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)" }
                    : { background: "rgba(255,255,255,0.02)" }
                  }
                >
                  <div className={["w-1.5 h-1.5 rounded-full shrink-0", model === m.id ? "bg-emerald-400" : "bg-muted-foreground/30"].join(" ")} />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[12px]">{m.label}</span>
                    <p className="text-[10px] opacity-50">{m.sub}</p>
                  </div>
                </button>
              ))}
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400/70 px-1 pt-1.5">Premium models</p>
              {MODELS.filter(m => !m.free).map(m => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={[
                    "flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all duration-150 text-xs",
                    model === m.id ? "text-white" : "border-white/8 text-muted-foreground hover:text-white hover:border-white/15",
                  ].join(" ")}
                  style={model === m.id
                    ? { background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)" }
                    : { background: "rgba(255,255,255,0.02)" }
                  }
                >
                  <div className={["w-1.5 h-1.5 rounded-full shrink-0", model === m.id ? "bg-indigo-400" : "bg-muted-foreground/30"].join(" ")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-[12px]">{m.label}</span>
                      {m.recommended && <span className="badge-recommended">⭐ Recommended</span>}
                    </div>
                    <p className="text-[10px] opacity-50">{m.sub}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Question input */}
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. Why does this work? Show me another method. Find related past papers…"
              rows={3}
              className="w-full resize-none rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
            />

            <button
              onClick={ask}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/80 hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Get AI Help + Search Library</>
              )}
            </button>

            <p className="text-[10px] text-muted-foreground/50 text-center">
              AI will also search 400+ textbooks &amp; past papers for relevant resources
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="space-y-3">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary">AI Response</span>
                </div>
                <div className="space-y-1.5">
                  {response.split("\n").map((line, i) =>
                    line.trim() ? (
                      <p key={i} className="text-xs text-slate-300 leading-relaxed">{line}</p>
                    ) : (
                      <div key={i} className="h-1" />
                    )
                  )}
                </div>
              </div>

              {resources.length > 0 && (
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-semibold text-indigo-400">Related Library Resources</span>
                  </div>
                  <ul className="space-y-1.5">
                    {resources.map((r, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <span className="text-indigo-400 shrink-0 mt-0.5">›</span>
                        <span className="text-slate-300">
                          <strong className="text-white">{r.title}</strong>
                          <span className="text-muted-foreground"> · {r.subject}{r.year ? ` · ${r.year}` : ""}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-muted-foreground/60 mt-2">Find these in the Study Library tab.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ReadingStats {
  novelsOpened: number; novelsFinished: number;
  booksOpened: number; booksFinished: number;
  papersStudied: number; totalXpFromReading: number;
}
interface XpInfo { xp: number; xpTotal: number; }

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function apiUrl(p: string) { return `${BASE_URL}api${p}`; }

interface ActivityEntry {
  id: number; type: string; description: string;
  xpEarned: number; tokensUsed: number; createdAt: string;
}
const ACTIVITY_ICONS: Record<string, string> = {
  solve: "🔢", quiz: "🧪", game: "🎮", course: "📚",
  chat: "💬", ocr: "📷", default: "⚡",
};
const ACTIVITY_COLORS: Record<string, string> = {
  solve: "text-violet-400", quiz: "text-yellow-400", game: "text-blue-400",
  course: "text-emerald-400", chat: "text-pink-400", ocr: "text-amber-400", default: "text-slate-400",
};

export default function ProfilePanel({ open, onClose, user, tokens, onLogout, onOpenShop }: ProfilePanelProps) {
  const [history, setHistory] = useState<Computation[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [historyTab, setHistoryTab] = useState<"solver" | "activity">("solver");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Computation | null>(null);

  // Confirmation dialogs
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting_account, setDeletingAccount] = useState(false);

  // XP + reading stats
  const [xpInfo, setXpInfo] = useState<XpInfo | null>(null);
  const [readingStats, setReadingStats] = useState<ReadingStats | null>(null);
  const [convertChunks, setConvertChunks] = useState(1);
  const [converting, setConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadXpStats = useCallback(async () => {
    try {
      const [xpRes, rRes] = await Promise.all([
        fetch(apiUrl("/tokens/balance"), { credentials: "include" }),
        fetch(apiUrl("/xp/reading-stats"), { credentials: "include" }),
      ]);
      if (xpRes.ok) {
        const d = await xpRes.json() as { balance?: number; xp?: number; xpTotal?: number };
        setXpInfo({ xp: d.xp ?? 0, xpTotal: d.xpTotal ?? 0 });
      }
      if (rRes.ok) {
        const d = await rRes.json() as { stats: ReadingStats };
        setReadingStats(d.stats);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = () => { loadXpStats(); };
    window.addEventListener("xp-updated", handler);
    return () => window.removeEventListener("xp-updated", handler);
  }, [loadXpStats]);

  const handleConvertXp = async () => {
    if (converting) return;
    setConverting(true); setConvertMsg(null);
    try {
      const res = await fetch(apiUrl("/xp/convert"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunks: convertChunks }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; tokensGained?: number; xp?: number };
      if (!res.ok) throw new Error(data.error ?? "Conversion failed");
      setXpInfo(prev => prev ? { ...prev, xp: data.xp ?? 0 } : null);
      setConvertMsg({ ok: true, text: `+${(data.tokensGained ?? 0).toLocaleString()} tokens earned!` });
      setTimeout(() => setConvertMsg(null), 3000);
    } catch (err) {
      setConvertMsg({ ok: false, text: (err as Error).message });
      setTimeout(() => setConvertMsg(null), 4000);
    }
    setConverting(false);
  };

  // Referral state
  const [refCode, setRefCode] = useState<string | null>(null);
  const [refCopied, setRefCopied] = useState(false);

  // Rating state
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingReview, setRatingReview] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [existingRating, setExistingRating] = useState<{ stars: number; review: string | null } | null>(null);
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const ratingPromptShown = useCallback(() => sessionStorage.getItem("rating_prompted") === "1", []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const [histRes, actRes] = await Promise.all([
        fetch(`/api/history?limit=50&t=${Date.now()}`, { credentials: "include", cache: "no-store" }),
        fetch(apiUrl("/activity"), { credentials: "include" }).catch(() => null),
      ]);
      if (histRes.ok) {
        const data = await histRes.json() as { entries: Computation[] };
        setHistory(data.entries);
      }
      if (actRes?.ok) {
        const data = await actRes.json() as { activities: ActivityEntry[] };
        setActivities(data.activities ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Show rating prompt once history is loaded — kept separate so that
  // changes to existingRating (after submitRating) don't re-trigger loadHistory
  useEffect(() => {
    if (history.length >= 10 && !ratingPromptShown() && !existingRating) {
      const timer = setTimeout(() => setShowRatingPrompt(true), 1200);
      sessionStorage.setItem("rating_prompted", "1");
      return () => clearTimeout(timer);
    }
  }, [history.length, existingRating, ratingPromptShown]);

  const loadRating = useCallback(async () => {
    try {
      const res = await fetch("/api/ratings/mine", { credentials: "include" });
      if (!res.ok) return;
      const { rating } = await res.json() as { rating: { stars: number; review: string | null } | null };
      if (rating) {
        setExistingRating(rating);
        setRatingStars(rating.stars);
        setRatingReview(rating.review ?? "");
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      loadHistory();
      loadRating();
      loadXpStats();
      setSelectedEntry(null);
      // Load referral code lazily
      if (!refCode) {
        fetch(apiUrl("/referral/my-code"), { credentials: "include" })
          .then(r => r.ok ? r.json() : null)
          .then((d: { code?: string } | null) => { if (d?.code) setRefCode(d.code); })
          .catch(() => {});
      }
    }
  }, [open, loadHistory, loadRating, loadXpStats, refCode]);

  const submitRating = async () => {
    if (!ratingStars) return;
    setRatingSubmitting(true);
    try {
      await fetch("/api/ratings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: ratingStars, review: ratingReview.trim() || null }),
      });
      setExistingRating({ stars: ratingStars, review: ratingReview.trim() || null });
      setRatingSubmitted(true);
      setShowRatingForm(false);
      setShowRatingPrompt(false);
    } catch {}
    setRatingSubmitting(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedEntry) setSelectedEntry(null);
        else onClose();
      }
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, selectedEntry]);

  const deleteEntry = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      await fetch(`/api/history/${id}`, { method: "DELETE", credentials: "include" });
      setHistory((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const clearAll = async () => {
    if (!confirm("Clear all your session history?")) return;
    await fetch("/api/history", { method: "DELETE", credentials: "include" });
    setHistory([]);
  };

  const displayName = user.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : (user.email ?? "Account");

  const nextRefill = tokens?.nextRefillAt
    ? new Date(tokens.nextRefillAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => { if (selectedEntry) setSelectedEntry(null); else onClose(); }}
          />

          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed top-0 left-0 bottom-0 w-full max-w-sm bg-[#0a0c14] border-r border-white/10 z-50 flex flex-col overflow-hidden"
          >
            <AnimatePresence mode="wait">
              {selectedEntry ? (
                <motion.div
                  key="detail"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  className="absolute inset-0 bg-[#0a0c14] flex flex-col"
                >
                  <EntryDetail entry={selectedEntry} onBack={() => setSelectedEntry(null)} />
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ x: 0 }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  className="flex flex-col h-full"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
                    <h2 className="font-display font-bold text-white text-lg">My Profile</h2>
                    <button
                      onClick={onClose}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 scrollbar-hide">
                    {/* User info */}
                    <div className="p-5 border-b border-white/10">
                      <div className="flex items-center gap-4 mb-4">
                        {user.profileImageUrl ? (
                          <img
                            src={user.profileImageUrl}
                            alt="avatar"
                            className="w-14 h-14 rounded-full border-2 border-primary/40 object-cover"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
                            <User className="w-6 h-6 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-white text-lg truncate">{displayName}</p>
                          {user.email && (
                            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                              <Mail className="w-3.5 h-3.5" />
                              <span className="truncate">{user.email}</span>
                            </div>
                          )}
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground capitalize">
                            {user.authProvider === "google" ? (
                              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none">
                                <path d="M15.07 8.17c0-.52-.05-1.02-.13-1.5H8v2.84h3.95c-.17.91-.7 1.68-1.49 2.2v1.82h2.41c1.41-1.3 2.2-3.21 2.2-5.36z" fill="#4285F4"/>
                                <path d="M8 16c1.98 0 3.64-.66 4.85-1.78l-2.41-1.82c-.66.44-1.51.7-2.44.7-1.88 0-3.47-1.27-4.04-2.97H1.47v1.87A7.99 7.99 0 0 0 8 16z" fill="#34A853"/>
                                <path d="M3.96 10.13A4.85 4.85 0 0 1 3.7 8.5c0-.57.1-1.12.26-1.63V4.99H1.47A8 8 0 0 0 0 8.5c0 1.29.31 2.51.87 3.59l2.67-1.96-.58-.01z" fill="#FBBC05"/>
                                <path d="M8 3.19c1.06 0 2.01.37 2.76 1.08l2.07-2.07A7.97 7.97 0 0 0 8 0 7.99 7.99 0 0 0 1.47 4.99L4.14 6.96C4.71 5.27 6.3 4 8 4v-.81z" fill="#EA4335"/>
                              </svg>
                            ) : (
                              <Mail className="w-3 h-3" />
                            )}
                            {user.authProvider === "google" ? "Google account" : "Email account"}
                          </span>
                        </div>
                      </div>

                      {tokens && (
                        <div className="space-y-2">
                          <div className="rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/5 border border-yellow-500/20 p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Coins className="w-4 h-4 text-yellow-400" />
                                <span className="text-sm font-semibold text-yellow-300">Token Balance</span>
                              </div>
                              <span className={`text-xl font-display font-bold ${tokens.balance <= 0 ? "text-red-400" : "text-yellow-300"}`}>{tokens.balance <= 0 ? "Depleted" : fmt(tokens.balance)}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-2">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-orange-400 transition-all"
                                style={{ width: `${Math.max(tokens.balance <= 0 ? 0 : 1, (tokens.balance / tokens.weeklyAllowance) * 100)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{fmt(tokens.totalUsed)} used</span>
                              {nextRefill && <span>Refills {nextRefill}</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => { onOpenShop?.(); }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
                            style={{
                              background: tokens.balance <= 0
                                ? "linear-gradient(135deg, rgba(239,68,68,0.25), rgba(249,115,22,0.2))"
                                : "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))",
                              border: tokens.balance <= 0
                                ? "1px solid rgba(239,68,68,0.4)"
                                : "1px solid rgba(99,102,241,0.35)",
                              color: tokens.balance <= 0 ? "#fca5a5" : "#c4b5fd",
                            }}
                          >
                            <Coins className="w-4 h-4" />
                            {tokens.balance <= 0 ? "Buy Tokens to Continue" : "Top Up Tokens"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Streak card */}
                    <div className="px-5 pb-4 border-b border-white/10">
                      <StreakCard />
                    </div>

                    {/* XP section */}
                    {xpInfo !== null && (
                      <div className="px-5 pb-5 border-b border-white/10">
                        <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
                          <Flame className="w-4 h-4 text-orange-400" />
                          XP &amp; Rewards
                        </h3>

                        {/* XP bar */}
                        <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.25)" }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-orange-300">Current XP</span>
                            <span className="text-lg font-display font-bold text-orange-300">
                              {(xpInfo.xp ?? 0).toLocaleString()}
                            </span>
                          </div>
                          {/* Progress to next 100K */}
                          {(() => {
                            const chunk = 100_000;
                            const progress = (xpInfo.xp % chunk) / chunk;
                            const chunksAvailable = Math.floor(xpInfo.xp / chunk);
                            return (
                              <>
                                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
                                  <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all"
                                    style={{ width: `${progress * 100}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>{((xpInfo.xp ?? 0) % chunk).toLocaleString()} / 100,000 XP</span>
                                  {chunksAvailable > 0 && (
                                    <span className="text-orange-300 font-semibold">{chunksAvailable}× 10K tokens ready</span>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        {/* Conversion UI */}
                        {Math.floor((xpInfo.xp ?? 0) / 100_000) > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Convert XP → Tokens (100,000 XP = 10,000 tokens)</p>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center rounded-xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                                <button onClick={() => setConvertChunks(v => Math.max(1, v - 1))}
                                  className="px-3 py-1.5 text-lg text-muted-foreground hover:text-white transition-colors">−</button>
                                <span className="px-2 text-sm font-bold text-white min-w-[2rem] text-center">{convertChunks}</span>
                                <button onClick={() => setConvertChunks(v => Math.min(Math.floor((xpInfo.xp ?? 0) / 100_000), v + 1))}
                                  className="px-3 py-1.5 text-lg text-muted-foreground hover:text-white transition-colors">+</button>
                              </div>
                              <div className="text-xs text-muted-foreground flex-1">
                                = {(convertChunks * 100_000).toLocaleString()} XP → {(convertChunks * 10_000).toLocaleString()} tokens
                              </div>
                              <button onClick={handleConvertXp} disabled={converting}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-60 transition-all"
                                style={{ background: "rgba(251,146,60,0.25)", border: "1px solid rgba(251,146,60,0.4)" }}>
                                {converting ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ArrowUpRight className="w-3 h-3" />Convert</>}
                              </button>
                            </div>
                            {convertMsg && (
                              <p className={`text-xs font-semibold ${convertMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                                {convertMsg.text}
                              </p>
                            )}
                          </div>
                        )}

                        {(xpInfo.xp ?? 0) < 100_000 && (
                          <p className="text-xs text-muted-foreground">
                            Earn {(100_000 - ((xpInfo.xp ?? 0) % 100_000)).toLocaleString()} more XP to convert to tokens. Complete quizzes, read novels and study papers to earn XP!
                          </p>
                        )}
                      </div>
                    )}

                    {/* Reading stats */}
                    {readingStats && (
                      <div className="px-5 pb-5 border-b border-white/10">
                        <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
                          <Library className="w-4 h-4 text-emerald-400" />
                          Reading Activity
                        </h3>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="p-2.5 rounded-xl text-center" style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
                            <p className="text-xl font-display font-bold text-emerald-300">{readingStats.novelsFinished}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Novels Finished</p>
                          </div>
                          <div className="p-2.5 rounded-xl text-center" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                            <p className="text-xl font-display font-bold text-blue-300">{readingStats.booksFinished}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Books Studied</p>
                          </div>
                          <div className="p-2.5 rounded-xl text-center" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }}>
                            <p className="text-xl font-display font-bold text-violet-300">{readingStats.papersStudied}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Papers Studied</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {readingStats.novelsOpened > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5">
                              <BookOpen className="w-3 h-3 text-emerald-400" />{readingStats.novelsOpened} novels opened
                            </span>
                          )}
                          {readingStats.booksOpened > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5">
                              <Library className="w-3 h-3 text-blue-400" />{readingStats.booksOpened} books opened
                            </span>
                          )}
                          {readingStats.totalXpFromReading > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5">
                              <Flame className="w-3 h-3 text-orange-400" />{readingStats.totalXpFromReading.toLocaleString()} XP from reading
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Stats */}
                    {history.length > 0 && (
                      <div className="px-5 pb-5">
                        <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-violet-400" />
                          My Stats
                        </h3>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="p-3 rounded-xl text-center" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                            <p className="text-2xl font-display font-bold text-violet-300">{history.length}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Problems Solved</p>
                          </div>
                          <div className="p-3 rounded-xl text-center" style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
                            <p className="text-2xl font-display font-bold text-emerald-300">{(() => {
                              const ops = history.map(h => h.operation);
                              const freq: Record<string, number> = {};
                              ops.forEach(o => { freq[o] = (freq[o] ?? 0) + 1; });
                              return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
                            })()}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Top Topic</p>
                          </div>
                          <div className="p-3 rounded-xl text-center" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                            <p className="text-2xl font-display font-bold text-yellow-300">{history.filter(h => h.isNumeric).length}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Numeric Results</p>
                          </div>
                          <div className="p-3 rounded-xl text-center" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                            <p className="text-2xl font-display font-bold text-blue-300">{(() => {
                              const ops = history.map(h => h.operation);
                              return new Set(ops).size;
                            })()}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Topics Covered</p>
                          </div>
                        </div>
                        {/* Breakdown */}
                        <div className="mt-3 space-y-1.5">
                          {(() => {
                            const freq: Record<string, number> = {};
                            history.forEach(h => { freq[h.operation] = (freq[h.operation] ?? 0) + 1; });
                            return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([op, count]) => (
                              <div key={op} className="flex items-center gap-2">
                                <span className={cn("text-[11px] font-medium w-24 truncate", OP_COLORS[op] ?? "text-slate-400")}>{op}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
                                  <div className="h-full rounded-full bg-violet-500/50 transition-all"
                                    style={{ width: `${(count / history.length) * 100}%` }} />
                                </div>
                                <span className="text-[11px] text-muted-foreground w-5 text-right">{count}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    )}

                    {/* History */}
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          History
                        </h3>
                        <div className="flex items-center gap-2">
                          <button onClick={loadHistory} className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all" title="Refresh">
                            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                          </button>
                          {history.length > 0 && historyTab === "solver" && (
                            <button onClick={clearAll} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all" title="Clear all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tabs */}
                      <div className="flex gap-1.5 mb-3">
                        {(["solver", "activity"] as const).map(t => (
                          <button key={t} onClick={() => setHistoryTab(t)}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all", historyTab === t ? "text-white" : "text-muted-foreground hover:text-white")}
                            style={historyTab === t ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)" } : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            {t === "solver" ? `Solver (${history.length})` : `Activities (${activities.length})`}
                          </button>
                        ))}
                      </div>

                      {/* Activity tab */}
                      {historyTab === "activity" && (
                        <div className="space-y-2">
                          {activities.length === 0 && !loading && (
                            <p className="text-center py-8 text-muted-foreground text-sm">No activities yet. Solve problems, play games, or complete courses to see them here.</p>
                          )}
                          {activities.map(a => (
                            <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border border-white/8 bg-white/2">
                              <span className="text-xl shrink-0 mt-0.5">{ACTIVITY_ICONS[a.type] ?? ACTIVITY_ICONS.default}</span>
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-xs font-bold uppercase", ACTIVITY_COLORS[a.type] ?? ACTIVITY_COLORS.default)}>{a.type}</p>
                                <p className="text-sm text-white/80 mt-0.5 line-clamp-2">{a.description}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {a.xpEarned > 0 && <span className="text-[10px] text-yellow-400 font-semibold">+{a.xpEarned} XP</span>}
                                  {a.tokensUsed > 0 && <span className="text-[10px] text-muted-foreground">-{a.tokensUsed} tokens</span>}
                                  <span className="text-[10px] text-muted-foreground/60">{timeAgo(a.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Solver tab hint */}
                      {historyTab === "solver" && history.length > 0 && !loading && (
                        <p className="text-[10px] text-muted-foreground/50 mb-3 flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          Tap any entry to ask AI for help and search the library
                        </p>
                      )}

                      {historyTab === "solver" && loading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
                          ))}
                        </div>
                      ) : historyTab === "solver" && history.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No sessions yet</p>
                          <p className="text-xs mt-1 opacity-60">Your solved problems will appear here</p>
                        </div>
                      ) : historyTab === "solver" ? (
                        <div className="space-y-2">
                          {history.map((entry) => (
                            <motion.button
                              key={entry.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              onClick={() => setSelectedEntry(entry)}
                              className="group w-full flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/9 border border-white/8 hover:border-white/20 transition-all text-left cursor-pointer"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={cn("text-xs font-semibold uppercase tracking-wider", OP_COLORS[entry.operation] ?? "text-slate-400")}>
                                    {entry.operation}
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeAgo(entry.createdAt)}</span>
                                </div>
                                <p className="text-sm text-white font-mono truncate">{entry.expression}</p>
                                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">= {entry.result}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                <span className="opacity-0 group-hover:opacity-100 text-[10px] text-primary transition-all whitespace-nowrap">Ask AI</span>
                                <button
                                  onClick={(e) => deleteEntry(entry.id, e)}
                                  disabled={deleting === entry.id}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-400 transition-all"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Referral Link */}
                  {refCode && (
                    <div className="px-5 pb-4">
                      <div className="rounded-xl p-3.5" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.22)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold text-indigo-300 uppercase tracking-wide">Invite Friends</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>+1,000 tokens per signup</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-2.5">Share your link. When a friend signs up through it, you both benefit — they get a head start and you earn bonus tokens.</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-black/30 rounded-lg px-2.5 py-1.5 text-xs font-mono text-indigo-200 truncate border border-indigo-500/20">
                            {window.location.origin + (import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "")) + "?ref=" + refCode}
                          </div>
                          <button
                            onClick={() => {
                              const url = window.location.origin + (import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "")) + "?ref=" + refCode;
                              navigator.clipboard.writeText(url).then(() => {
                                setRefCopied(true);
                                setTimeout(() => setRefCopied(false), 2000);
                              });
                            }}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{ background: refCopied ? "rgba(52,211,153,0.2)" : "rgba(99,102,241,0.2)", color: refCopied ? "#6ee7b7" : "#a5b4fc", border: `1px solid ${refCopied ? "rgba(52,211,153,0.3)" : "rgba(99,102,241,0.3)"}` }}>
                            {refCopied ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rate the App */}
                  <div className="px-5 pb-4">
                    {ratingSubmitted || existingRating ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(i => (
                            <Star key={i} className={`w-4 h-4 ${i <= (existingRating?.stars ?? ratingStars) ? "text-yellow-400 fill-yellow-400" : "text-white/20"}`} />
                          ))}
                        </div>
                        <span className="text-xs text-yellow-300 font-semibold flex-1">Your rating</span>
                        <button onClick={() => setShowRatingForm(true)} className="text-[10px] text-muted-foreground hover:text-white transition-all">Edit</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowRatingForm(true)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01]"
                        style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
                        <Star className="w-4 h-4" /> Rate this App
                      </button>
                    )}
                  </div>

                  {/* Sign out */}
                  <div className="p-5 border-t border-white/10 shrink-0">
                    <button
                      onClick={() => setConfirmLogout(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-all"
                    >
                      Sign out
                    </button>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-900/50 text-red-600 hover:bg-red-900/20 text-xs font-medium transition-all mt-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Account
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Logout confirmation */}
          <AnimatePresence>
            {confirmLogout && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
                  className="w-full max-w-xs rounded-2xl p-6 space-y-4 shadow-2xl"
                  style={{ background: "#0d0f1c", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <div className="text-center">
                    <p className="text-lg font-display font-bold text-white">Sign out?</p>
                    <p className="text-sm text-muted-foreground mt-1">Are you sure you want to sign out of your account?</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmLogout(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-all">
                      Cancel
                    </button>
                    <button onClick={() => { setConfirmLogout(false); onLogout(); onClose(); }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                      style={{ background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.4)" }}>
                      Sign out
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Delete account confirmation */}
          <AnimatePresence>
            {confirmDelete && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
                  className="w-full max-w-xs rounded-2xl p-6 space-y-4 shadow-2xl"
                  style={{ background: "#0d0f1c", border: "1px solid rgba(185,28,28,0.5)" }}>
                  <div className="text-center space-y-2">
                    <div className="text-3xl">⚠️</div>
                    <p className="text-lg font-display font-bold text-red-300">Delete Account?</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      This will permanently delete your account, all history, XP, and progress. <strong className="text-red-300">This cannot be undone.</strong>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-all">
                      Cancel
                    </button>
                    <button disabled={deleting_account}
                      onClick={async () => {
                        setDeletingAccount(true);
                        try {
                          const res = await fetch(apiUrl("/auth/account"), { method: "DELETE", credentials: "include" });
                          if (res.ok) { setConfirmDelete(false); onLogout(); onClose(); }
                        } catch {} finally { setDeletingAccount(false); }
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(185,28,28,0.4)", border: "1px solid rgba(185,28,28,0.6)" }}>
                      {deleting_account ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…</> : "Delete Forever"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Rating prompt popup */}
          <AnimatePresence>
            {showRatingPrompt && !showRatingForm && (
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 w-72 p-5 rounded-2xl z-[60] text-center shadow-2xl"
                style={{ background: "linear-gradient(135deg, #1a1b2e, #0f1117)", border: "1px solid rgba(251,191,36,0.3)" }}>
                <div className="flex justify-center mb-3">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-6 h-6 text-yellow-400 fill-yellow-400" />)}
                </div>
                <h3 className="font-display font-bold text-white text-base mb-1">Enjoying Zimsolve?</h3>
                <p className="text-xs text-muted-foreground mb-4">You've solved 10+ problems! Share your experience.</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowRatingPrompt(false)}
                    className="flex-1 py-2 rounded-xl text-xs text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-all">
                    Not now
                  </button>
                  <button onClick={() => { setShowRatingPrompt(false); setShowRatingForm(true); }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all"
                    style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.4), rgba(245,158,11,0.3))", border: "1px solid rgba(251,191,36,0.5)" }}>
                    Rate App
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Rating form modal (inside the panel) */}
          <AnimatePresence>
            {showRatingForm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[55] flex items-center justify-center p-6"
                onClick={() => setShowRatingForm(false)}>
                <motion.div
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="w-full max-w-xs rounded-2xl p-6 space-y-4"
                  style={{ background: "#0d0f1c", border: "1px solid rgba(251,191,36,0.3)" }}>
                  <div className="text-center">
                    <h3 className="font-display font-bold text-white text-lg">Rate Zimsolve</h3>
                    <p className="text-xs text-muted-foreground mt-1">Tap to rate your experience</p>
                  </div>

                  {/* Stars */}
                  <div className="flex justify-center gap-2">
                    {[1,2,3,4,5].map(i => (
                      <button key={i}
                        onMouseEnter={() => setRatingHover(i)}
                        onMouseLeave={() => setRatingHover(0)}
                        onClick={() => setRatingStars(i)}
                        className="transition-transform hover:scale-110 active:scale-95">
                        <Star className={`w-9 h-9 transition-colors ${i <= (ratingHover || ratingStars) ? "text-yellow-400 fill-yellow-400" : "text-white/20"}`} />
                      </button>
                    ))}
                  </div>

                  {/* Review */}
                  <textarea
                    value={ratingReview}
                    onChange={e => setRatingReview(e.target.value)}
                    placeholder="Write a review (optional)…"
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 focus:border-yellow-400/50 outline-none text-white placeholder-muted-foreground resize-none transition-colors"
                  />

                  <div className="flex gap-2">
                    <button onClick={() => setShowRatingForm(false)}
                      className="flex-1 py-2 rounded-xl text-sm text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-all">
                      Cancel
                    </button>
                    <button onClick={submitRating} disabled={!ratingStars || ratingSubmitting}
                      className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                      style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.4), rgba(245,158,11,0.3))", border: "1px solid rgba(251,191,36,0.5)" }}>
                      {ratingSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</> : "Submit"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
