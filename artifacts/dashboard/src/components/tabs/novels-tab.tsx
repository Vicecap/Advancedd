import React, { useState, useEffect, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  BookOpen, Search, X, ChevronLeft, ChevronRight,
  Loader2, Library, Star, AlertCircle, User, FileText,
  Minus, Plus, CheckCircle2, Clock, Trash2, BookMarked,
  RotateCcw, ChevronDown, Globe, ExternalLink,
  Sparkles, Wand2, XCircle, Hash,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import ResourceSearch from "@/components/resource-search";
import PdfReader from "@/components/pdf-reader";
import { useAuth } from "@/hooks/use-auth";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Novel {
  id: number;
  title: string;
  author: string;
  genre: string;
  fileSizeKb: number | null;
  featured: boolean;
}

// ── Reading List ──────────────────────────────────────────────────────────────

const RL_KEY = "novels_reading_list_v1";

interface ReadingEntry {
  id: number;
  title: string;
  author: string;
  genre: string;
  featured: boolean;
  status: "reading" | "finished";
  lastPage: number;
  openedAt: string;
  finishedAt?: string;
}

function useReadingList() {
  const [list, setList] = useState<ReadingEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(RL_KEY) || "[]"); }
    catch { return []; }
  });

  const persist = (updated: ReadingEntry[]) => {
    setList(updated);
    localStorage.setItem(RL_KEY, JSON.stringify(updated));
  };

  const markOpened = useCallback((novel: Novel) => {
    setList(prev => {
      const exists = prev.find(e => e.id === novel.id);
      const updated: ReadingEntry[] = exists
        ? prev.map(e => e.id === novel.id ? { ...e } : e)
        : [...prev, {
            id: novel.id, title: novel.title, author: novel.author,
            genre: novel.genre, featured: novel.featured,
            status: "reading", lastPage: 1, openedAt: new Date().toISOString(),
          }];
      localStorage.setItem(RL_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updatePage = useCallback((id: number, page: number) => {
    setList(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, lastPage: page } : e);
      localStorage.setItem(RL_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const markFinished = useCallback((id: number) => {
    setList(prev => {
      const updated = prev.map(e => e.id === id
        ? { ...e, status: "finished" as const, finishedAt: new Date().toISOString() }
        : e);
      localStorage.setItem(RL_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const markReading = useCallback((id: number) => {
    setList(prev => {
      const updated = prev.map(e => e.id === id
        ? { ...e, status: "reading" as const, finishedAt: undefined }
        : e);
      localStorage.setItem(RL_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setList(prev => {
      const updated = prev.filter(e => e.id !== id);
      localStorage.setItem(RL_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getEntry = useCallback((id: number) => list.find(e => e.id === id), [list]);

  return { list, markOpened, updatePage, markFinished, markReading, remove, getEntry };
}

// ── Genre config ──────────────────────────────────────────────────────────────

const GENRE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Thriller:          { bg: "rgba(239,68,68,0.12)",   text: "#fca5a5", border: "rgba(239,68,68,0.3)"   },
  Romance:           { bg: "rgba(236,72,153,0.12)",  text: "#f9a8d4", border: "rgba(236,72,153,0.3)"  },
  Classic:           { bg: "rgba(245,158,11,0.12)",  text: "#fcd34d", border: "rgba(245,158,11,0.3)"  },
  Fiction:           { bg: "rgba(99,102,241,0.12)",  text: "#a5b4fc", border: "rgba(99,102,241,0.3)"  },
  Fantasy:           { bg: "rgba(139,92,246,0.12)",  text: "#c4b5fd", border: "rgba(139,92,246,0.3)"  },
  "Self-help":       { bg: "rgba(16,185,129,0.12)",  text: "#6ee7b7", border: "rgba(16,185,129,0.3)"  },
  Philosophy:        { bg: "rgba(6,182,212,0.12)",   text: "#67e8f9", border: "rgba(6,182,212,0.3)"   },
  "Science Fiction": { bg: "rgba(59,130,246,0.12)",  text: "#93c5fd", border: "rgba(59,130,246,0.3)"  },
  Technology:        { bg: "rgba(20,184,166,0.12)",  text: "#5eead4", border: "rgba(20,184,166,0.3)"  },
  Mathematics:       { bg: "rgba(168,85,247,0.12)",  text: "#d8b4fe", border: "rgba(168,85,247,0.3)"  },
  Science:           { bg: "rgba(14,165,233,0.12)",  text: "#7dd3fc", border: "rgba(14,165,233,0.3)"  },
};

const GENRES = [
  "All", "Thriller", "Romance", "Classic", "Fantasy", "Fiction",
  "Philosophy", "Self-help", "Science Fiction", "Technology", "Mathematics", "Science",
];

const GENRE_EMOJIS: Record<string, string> = {
  All: "📚", Thriller: "🔪", Romance: "💕", Classic: "🏛️",
  Fiction: "🌍", Fantasy: "🐉", "Self-help": "💡", Philosophy: "🧠",
  "Science Fiction": "🚀", Technology: "💻", Mathematics: "📐", Science: "🔬",
};

const GENRE_COVERS: Record<string, string> = {
  Thriller:          "linear-gradient(135deg, #1a0a0a 0%, #450a0a 50%, #7f1d1d 100%)",
  Romance:           "linear-gradient(135deg, #1a0010 0%, #500030 50%, #9d174d 100%)",
  Classic:           "linear-gradient(135deg, #1a1200 0%, #451a03 50%, #78350f 100%)",
  Fiction:           "linear-gradient(135deg, #0a001a 0%, #1e1b4b 50%, #3730a3 100%)",
  Fantasy:           "linear-gradient(135deg, #0f0020 0%, #2e1065 50%, #6d28d9 100%)",
  "Self-help":       "linear-gradient(135deg, #001a0a 0%, #052e16 50%, #166534 100%)",
  Philosophy:        "linear-gradient(135deg, #00121a 0%, #0c4a6e 50%, #0369a1 100%)",
  "Science Fiction": "linear-gradient(135deg, #001022 0%, #172554 50%, #1d4ed8 100%)",
  Technology:        "linear-gradient(135deg, #001a18 0%, #042f2e 50%, #0d9488 100%)",
  Mathematics:       "linear-gradient(135deg, #1a0030 0%, #3b0764 50%, #7e22ce 100%)",
  Science:           "linear-gradient(135deg, #001520 0%, #0c3352 50%, #0284c7 100%)",
};

function getCover(genre: string) {
  return GENRE_COVERS[genre] || GENRE_COVERS.Fiction;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Reading List Card (small, horizontal) ─────────────────────────────────────

function ReadingListCard({
  entry,
  onResume,
  onToggleFinished,
  onRemove,
}: {
  entry: ReadingEntry;
  onResume: () => void;
  onToggleFinished: () => void;
  onRemove: () => void;
}) {
  const gs = GENRE_STYLES[entry.genre] || GENRE_STYLES.Fiction;
  const isFinished = entry.status === "finished";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex items-center gap-3 p-3 rounded-xl border border-white/8 hover:border-white/15 transition-all group"
      style={{ background: "rgba(14,17,35,0.6)" }}
    >
      {/* Mini cover */}
      <div className="w-10 h-12 rounded-lg flex items-center justify-center text-xl shrink-0 relative overflow-hidden"
        style={{ background: getCover(entry.genre) }}>
        <span>{GENRE_EMOJIS[entry.genre] || "📖"}</span>
        {isFinished && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.55)" }}>
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-white truncate">{entry.title}</p>
        <p className="text-[11px] text-muted-foreground/70 truncate">{entry.author}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ background: gs.bg, border: `1px solid ${gs.border}`, color: gs.text }}>
            {entry.genre}
          </span>
          {isFinished ? (
            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Finished {entry.finishedAt ? fmtDate(entry.finishedAt) : ""}
            </span>
          ) : (
            <span className="text-[10px] text-indigo-400 font-medium flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Page {entry.lastPage}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
        <button
          onClick={onResume}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all"
          style={{ background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.4)" }}
          title={isFinished ? "Read again" : "Continue reading"}
        >
          {isFinished ? "Re-read" : "Continue"}
        </button>
        <button
          onClick={onToggleFinished}
          className={cn(
            "p-1.5 rounded-lg transition-all",
            isFinished
              ? "text-yellow-400 hover:bg-yellow-400/10"
              : "text-emerald-400 hover:bg-emerald-400/10"
          )}
          title={isFinished ? "Mark as reading" : "Mark as finished"}
        >
          {isFinished
            ? <RotateCcw className="w-3.5 h-3.5" />
            : <CheckCircle2 className="w-3.5 h-3.5" />
          }
        </button>
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-red-400 hover:bg-red-400/10 transition-all"
          title="Remove from list"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ── Novel Grid Card ───────────────────────────────────────────────────────────

function NovelCard({
  novel, onRead, readingEntry,
}: {
  novel: Novel;
  onRead: (novel: Novel) => void;
  readingEntry?: ReadingEntry;
}) {
  const genreStyle = GENRE_STYLES[novel.genre] || GENRE_STYLES.Fiction;
  const isFinished = readingEntry?.status === "finished";
  const isReading = readingEntry?.status === "reading";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex flex-col rounded-2xl overflow-hidden border hover:border-white/20 transition-all duration-200 cursor-pointer relative"
      style={{ background: "rgba(14, 17, 35, 0.7)", borderColor: isReading ? "rgba(99,102,241,0.35)" : isFinished ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)" }}
      onClick={() => onRead(novel)}
    >
      {/* Reading status badge */}
      {readingEntry && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
          style={isFinished
            ? { background: "rgba(16,185,129,0.3)", border: "1px solid rgba(16,185,129,0.5)", color: "#6ee7b7" }
            : { background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)", color: "#a5b4fc" }
          }>
          {isFinished ? <CheckCircle2 className="w-2 h-2" /> : <Clock className="w-2 h-2" />}
          {isFinished ? "Done" : `p.${readingEntry.lastPage}`}
        </div>
      )}

      {/* Cover */}
      <div className="relative h-44 flex flex-col items-center justify-center p-4 overflow-hidden shrink-0"
        style={{ background: getCover(novel.genre) }}>
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 60%)" }} />
        <div className="relative text-center">
          <div className="text-4xl mb-2">{GENRE_EMOJIS[novel.genre] || "📖"}</div>
          <p className="text-xs text-white/60 font-semibold uppercase tracking-widest">{novel.genre}</p>
        </div>
        {novel.featured && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(245,158,11,0.25)", border: "1px solid rgba(245,158,11,0.4)" }}>
            <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            <span className="text-[9px] text-yellow-300 font-bold uppercase tracking-wider">Featured</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
          <div className="px-4 py-2 rounded-xl text-white text-xs font-bold"
            style={{ background: "rgba(99,102,241,0.9)" }}>
            {readingEntry ? (isFinished ? "Read Again" : "Continue") : "Read Now"}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-col p-3 flex-1">
        <h3 className="text-[13px] font-bold text-white leading-snug line-clamp-2 mb-1">{novel.title}</h3>
        <div className="flex items-center gap-1 mb-2">
          <User className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
          <p className="text-[11px] text-muted-foreground/70 truncate">{novel.author}</p>
        </div>
        <div className="mt-auto flex items-center justify-between">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: genreStyle.bg, border: `1px solid ${genreStyle.border}`, color: genreStyle.text }}>
            {novel.genre}
          </span>
          {novel.fileSizeKb && (
            <span className="text-[10px] text-muted-foreground/50">
              {novel.fileSizeKb >= 1000 ? `${(novel.fileSizeKb / 1024).toFixed(1)} MB` : `${novel.fileSizeKb} KB`}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── PDF Reader ────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.4;
const MAX_SCALE = 3.5;
const SCALE_STEP = 0.15;

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

function NovelReader({
  novel,
  initialPage,
  onClose,
  onPageChange,
  onMarkFinished,
}: {
  novel: Novel;
  initialPage: number;
  onClose: () => void;
  onPageChange: (page: number) => void;
  onMarkFinished: () => void;
}) {
  const [numPages, setNumPages] = useState<number>(0);
  const [page, setPage] = useState(initialPage || 1);
  const [scale, setScale] = useState(() => isMobile() ? 0.9 : 1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markedFinished, setMarkedFinished] = useState(false);
  const [swipeFlash, setSwipeFlash] = useState<"←" | "→" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const proxyUrl = `/api/novels/proxy?id=${novel.id}`;
  const genreStyle = GENRE_STYLES[novel.genre] || GENRE_STYLES.Fiction;

  const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +v.toFixed(2)));

  const changePage = useCallback((next: number) => {
    setPage(next);
    onPageChange(next);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [onPageChange]);

  // ── Mouse-wheel zoom ──────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setScale(s => clamp(s + (e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP)));
    }
  }, []);

  // ── Pinch-to-zoom + swipe-to-turn ─────────────────────────────────────────────
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), scale };
      swipeStartRef.current = null;
    } else if (e.touches.length === 1) {
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [scale]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setScale(clamp(pinchRef.current.scale * (Math.hypot(dx, dy) / pinchRef.current.dist)));
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!swipeStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 100) {
      if (dx < 0) {
        const next = Math.min(numPages || 1, page + 1);
        if (next !== page) { changePage(next); setSwipeFlash("→"); setTimeout(() => setSwipeFlash(null), 600); }
      } else {
        const prev = Math.max(1, page - 1);
        if (prev !== page) { changePage(prev); setSwipeFlash("←"); setTimeout(() => setSwipeFlash(null), 600); }
      }
    }
  }, [page, numPages, changePage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") changePage(Math.min(numPages || 1, page + 1));
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   changePage(Math.max(1, page - 1));
      if ((e.ctrlKey || e.metaKey) && e.key === "=") { e.preventDefault(); setScale(s => clamp(s + SCALE_STEP)); }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); setScale(s => clamp(s - SCALE_STEP)); }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); setScale(isMobile() ? 0.9 : 1.2); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages, page, changePage, onClose]);

  // ── Handle window resize → adjust default scale ───────────────────────────────
  useEffect(() => {
    const onResize = () => {
      setScale(prev => {
        const defaultScale = isMobile() ? 0.9 : 1.2;
        // Only snap to new default if user hasn't manually zoomed (within ±0.05 of old default)
        const wasDefault = Math.abs(prev - (isMobile() ? 1.2 : 0.9)) < 0.05 || Math.abs(prev - 0.9) < 0.05 || Math.abs(prev - 1.2) < 0.05;
        return wasDefault ? defaultScale : prev;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleMarkFinished = () => {
    setMarkedFinished(true);
    onMarkFinished();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(4, 5, 12, 0.98)", backdropFilter: "blur(20px)" }}
    >
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-white/8"
        style={{ background: "rgba(7, 9, 18, 0.9)" }}>
        <button onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-white transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0"
            style={{ background: getCover(novel.genre) }}>
            {GENRE_EMOJIS[novel.genre] || "📖"}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-white truncate">{novel.title}</p>
            <p className="text-[10px] text-muted-foreground truncate">{novel.author}</p>
          </div>
        </div>

        {/* Zoom strip */}
        <div className="flex items-center gap-0.5 shrink-0 px-1.5 py-1 rounded-xl"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={() => setScale(s => clamp(s - SCALE_STEP))}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Zoom out">
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="range"
            min={MIN_SCALE * 100}
            max={MAX_SCALE * 100}
            step={5}
            value={Math.round(scale * 100)}
            onChange={e => setScale(clamp(Number(e.target.value) / 100))}
            className="w-16 sm:w-24 accent-indigo-500 cursor-pointer"
          />
          <button onClick={() => setScale(s => clamp(s + SCALE_STEP))}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Zoom in">
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => setScale(isMobile() ? 0.9 : 1.2)}
            className="px-1.5 py-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors text-[11px] font-mono font-semibold min-w-[2.8rem] text-center">
            {Math.round(scale * 100)}%
          </button>
        </div>

        <button onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-white transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Hint bar ── */}
      <div className="shrink-0 flex items-center justify-center gap-3 py-1 px-4 text-[10px] text-muted-foreground/40 border-b border-white/4"
        style={{ background: "rgba(7, 9, 18, 0.5)" }}>
        <span className="hidden sm:inline">
          <kbd className="px-1 rounded text-[9px] font-mono" style={{ background: "rgba(255,255,255,0.07)" }}>Ctrl+Scroll</kbd> zoom
        </span>
        <span className="sm:hidden">Swipe ← → to turn pages</span>
        <span className="hidden sm:inline">Pinch to zoom</span>
        <span className="hidden sm:inline">
          <kbd className="px-1 rounded text-[9px] font-mono" style={{ background: "rgba(255,255,255,0.07)" }}>← →</kbd> pages
        </span>
        <span className="hidden md:inline">
          <kbd className="px-1 rounded text-[9px] font-mono" style={{ background: "rgba(255,255,255,0.07)" }}>Esc</kbd> close
        </span>
      </div>

      {/* ── Swipe flash overlay ── */}
      {swipeFlash && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
          <div className="px-6 py-3 rounded-2xl text-2xl font-bold text-white/90"
            style={{ background: "rgba(99,102,241,0.35)", backdropFilter: "blur(8px)", border: "1px solid rgba(99,102,241,0.4)" }}>
            {swipeFlash === "→" ? `Next page ${swipeFlash}` : `${swipeFlash} Prev page`}
          </div>
        </div>
      )}

      {/* ── PDF ── */}
      <div ref={scrollRef}
        className="flex-1 overflow-auto flex items-start justify-center py-4 px-1"
        style={{ touchAction: "pan-y" }}>
        {error ? (
          <div className="flex flex-col items-center gap-4 mt-20 text-center">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <div>
              <p className="text-sm font-semibold text-white">Could not load book</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
            </div>
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.4)" }}>
              Back to Library
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {loading && (
              <div className="flex flex-col items-center gap-3 mt-20">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-sm text-muted-foreground">Loading <strong className="text-white">{novel.title}</strong>…</p>
              </div>
            )}
            <Document
              file={proxyUrl}
              onLoadSuccess={({ numPages }) => { setNumPages(numPages); setLoading(false); }}
              onLoadError={err => { setError(err.message || "Failed to load"); setLoading(false); }}
              loading=""
            >
              <Page
                pageNumber={page}
                scale={scale}
                className="shadow-2xl shadow-black/60 rounded-xl overflow-hidden"
                renderTextLayer={true}
                renderAnnotationLayer={false}
              />
            </Document>
          </div>
        )}
      </div>

      {/* ── Footer navigation ── */}
      {!loading && !error && numPages > 0 && (
        <div className="shrink-0 border-t border-white/8" style={{ background: "rgba(7, 9, 18, 0.9)" }}>
          {/* Page nav row */}
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <button
              onClick={() => changePage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-30 hover:bg-white/10 disabled:cursor-not-allowed border border-white/10 transition-all">
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            <div className="flex items-center gap-1.5">
              <input
                type="number" min={1} max={numPages} value={page}
                onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= numPages) changePage(v); }}
                className="w-12 text-center text-sm font-bold text-white rounded-lg px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
              />
              <span className="text-xs text-muted-foreground">/ {numPages.toLocaleString()}</span>
            </div>

            <button
              onClick={() => changePage(Math.min(numPages, page + 1))}
              disabled={page >= numPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-30 hover:bg-white/10 disabled:cursor-not-allowed border border-white/10 transition-all">
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mark finished row */}
          <div className="flex items-center justify-center pb-2.5">
            {markedFinished ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Marked as finished!
              </p>
            ) : (
              <button
                onClick={handleMarkFinished}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[12px] font-semibold transition-all"
                style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7" }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark as Finished
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Reading List Section ──────────────────────────────────────────────────────

function ReadingListSection({
  list,
  onResume,
  onToggleFinished,
  onRemove,
}: {
  list: ReadingEntry[];
  onResume: (entry: ReadingEntry) => void;
  onToggleFinished: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const reading = list.filter(e => e.status === "reading");
  const finished = list.filter(e => e.status === "finished");

  if (list.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/8"
      style={{ background: "rgba(10,12,28,0.6)" }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
        <div className="flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">My Reading List</h3>
          <div className="flex items-center gap-1">
            {reading.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}>
                {reading.length} reading
              </span>
            )}
            {finished.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7" }}>
                {finished.length} finished
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", collapsed ? "-rotate-90" : "")} />
      </button>

      {!collapsed && (
        <div className="border-t border-white/6 p-3 space-y-4">
          {/* Currently reading */}
          {reading.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Currently Reading</span>
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {reading.map(entry => (
                    <ReadingListCard
                      key={entry.id}
                      entry={entry}
                      onResume={() => onResume(entry)}
                      onToggleFinished={() => onToggleFinished(entry.id)}
                      onRemove={() => onRemove(entry.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Finished */}
          {finished.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Finished</span>
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {finished.map(entry => (
                    <ReadingListCard
                      key={entry.id}
                      entry={entry}
                      onResume={() => onResume(entry)}
                      onToggleFinished={() => onToggleFinished(entry.id)}
                      onRemove={() => onRemove(entry.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── External Book Type ─────────────────────────────────────────────────────────

interface ExtBook { title: string; pdf: string; author?: string; }

// ── Book Category config ───────────────────────────────────────────────────────

const BOOK_CATEGORIES_ORDER = [
  "Mathematics & Education",
  "Science & Technology",
  "Self-Help & Motivation",
  "Business & Finance",
  "History & Politics",
  "Health & Medicine",
  "Philosophy & Religion",
  "Fiction & Literature",
  "Arts & Culture",
  "Other",
];

const BOOK_CAT_KEYWORDS: Record<string, string[]> = {
  "Mathematics & Education": ["math","algebra","calculus","geometry","statistics","trigonometry","equation","theorem","proof","arithmetic","education","learning","textbook","lecture","study guide","tutorial","exam","school","college","university"],
  "Science & Technology": ["physics","chemistry","biology","science","programming","computer","software","engineering","technology","machine learning","artificial intelligence","data","algorithm","python","javascript","quantum","astronomy","neuroscience","robotics","electronics"],
  "Self-Help & Motivation": ["self-help","self help","motivation","mindset","habit","success","productivity","confidence","communication","goal","personal development","growth","mindfulness","happiness","positive thinking","leadership","courage","discipline","resilience"],
  "Business & Finance": ["business","finance","investing","money","marketing","entrepreneur","management","economics","accounting","trading","wealth","startup","strategy","negotiation","sales","stock","crypto","banking","budget","tax"],
  "History & Politics": ["history","historical","world war","politics","political","government","civilization","ancient","revolution","empire","africa","war","biography","president","democracy","colonialism","slavery","religion history","society"],
  "Health & Medicine": ["health","medicine","medical","nutrition","diet","fitness","psychology","mental health","therapy","wellness","anatomy","disease","doctor","exercise","body","cancer","anxiety","depression","yoga","sleep"],
  "Philosophy & Religion": ["philosophy","religion","spiritual","ethics","logic","moral","theology","consciousness","metaphysics","bible","quran","buddhism","stoic","existentialism","nietzsche","plato","aristotle"],
  "Fiction & Literature": ["novel","fiction","story","tales","literary","poetry","drama","shakespeare","classics","narrative","mystery","thriller fiction","romance novel","fantasy novel","sci-fi novel"],
  "Arts & Culture": ["art","music","culture","design","photography","drawing","painting","creative","architecture","film","cinema","dance","theatre","fashion","graphic"],
};

const BOOK_CAT_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  "Mathematics & Education": { color: "#d8b4fe", bg: "rgba(168,85,247,0.1)",  border: "rgba(168,85,247,0.28)" },
  "Science & Technology":    { color: "#93c5fd", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.28)"  },
  "Self-Help & Motivation":  { color: "#6ee7b7", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.28)"  },
  "Business & Finance":      { color: "#fcd34d", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.28)"  },
  "History & Politics":      { color: "#fca5a5", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.28)"   },
  "Health & Medicine":       { color: "#f9a8d4", bg: "rgba(236,72,153,0.1)",  border: "rgba(236,72,153,0.28)"  },
  "Philosophy & Religion":   { color: "#67e8f9", bg: "rgba(6,182,212,0.1)",   border: "rgba(6,182,212,0.28)"   },
  "Fiction & Literature":    { color: "#fde68a", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.22)"  },
  "Arts & Culture":          { color: "#fbcfe8", bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.22)"  },
  "Other":                   { color: "#a1a1aa", bg: "rgba(161,161,170,0.07)",border: "rgba(161,161,170,0.2)"  },
};

const BOOK_CAT_EMOJIS: Record<string, string> = {
  "Mathematics & Education": "📐", "Science & Technology": "🔬",
  "Self-Help & Motivation": "💡",  "Business & Finance": "💼",
  "History & Politics": "🏛️",     "Health & Medicine": "🏥",
  "Philosophy & Religion": "🧠",   "Fiction & Literature": "📖",
  "Arts & Culture": "🎨",          "Other": "📚",
};

function guessBookCategory(title: string): string {
  const lower = title.toLowerCase();
  for (const cat of BOOK_CATEGORIES_ORDER) {
    if (cat === "Other") break;
    const kws = BOOK_CAT_KEYWORDS[cat];
    if (kws && kws.some(kw => lower.includes(kw))) return cat;
  }
  return "Other";
}

const BOOKS_PER_CAT = 24;

function BookCategorySection({
  category, books, onSelect, defaultOpen,
}: {
  category: string; books: ExtBook[]; onSelect: (b: ExtBook) => void; defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [visible, setVisible] = useState(BOOKS_PER_CAT);
  const cs = BOOK_CAT_STYLES[category];
  const shown = books.slice(0, visible);
  const hasMore = visible < books.length;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        style={{ background: open ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg shrink-0">{BOOK_CAT_EMOJIS[category] ?? "📚"}</span>
          <span className="text-sm font-bold text-white">{category}</span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
            {books.length} book{books.length !== 1 ? "s" : ""}
          </span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="p-3 space-y-3 border-t border-white/8" style={{ background: "rgba(0,0,0,0.12)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {shown.map((book, i) => (
              <motion.button
                key={`${book.title}-${i}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.13, delay: Math.min(i * 0.015, 0.25) }}
                onClick={() => onSelect(book)}
                className="group flex flex-col rounded-xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="flex items-center justify-center w-full aspect-[3/4] rounded-lg mb-2 relative overflow-hidden"
                  style={{ background: cs ? cs.bg : "rgba(16,185,129,0.08)", border: `1px solid ${cs?.border ?? "rgba(255,255,255,0.1)"}` }}>
                  <FileText className="w-8 h-8 transition-colors" style={{ color: cs?.color ?? "#6ee7b7", opacity: 0.75 }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-1.5 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-bold text-white bg-emerald-500/80 px-2 py-0.5 rounded-full">Read</span>
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-white leading-tight line-clamp-2 group-hover:text-emerald-300 transition-colors">
                  {book.title.replace(/ PDF.*/i, "").replace(/\s+by\s+.*/i, "")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 opacity-70">{book.author || "PDF Book"}</p>
              </motion.button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">{shown.length} of {books.length} shown</span>
            {hasMore && (
              <button
                onClick={() => setVisible(v => v + BOOKS_PER_CAT)}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
                style={{ background: cs ? cs.bg : "rgba(16,185,129,0.15)", border: `1px solid ${cs?.border ?? "rgba(16,185,129,0.35)"}`, color: cs?.color ?? "#6ee7b7" }}
              >
                <ChevronDown className="w-3.5 h-3.5" /> Load More ({books.length - visible} more)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Books Library (external PDFDrive) ─────────────────────────────────────────

function BooksLibrary() {
  const [books, setBooks] = useState<ExtBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [streamPage, setStreamPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedBook, setSelectedBook] = useState<ExtBook | null>(null);
  const [error, setError] = useState(false);

  // ── AI search state ──────────────────────────────────────────────────────────
  const [aiQuery, setAiQuery] = useState("");
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiActive, setAiActive] = useState(false);
  const [aiError, setAiError] = useState("");

  const handleAISearch = useCallback(async () => {
    if (!aiQuery.trim() || aiSearching) return;
    setAiSearching(true);
    setAiError("");
    setAiActive(false);
    setAiKeywords([]);
    setSearch(""); // clear manual search
    try {
      const r = await fetch("/api/ai-book-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: aiQuery.trim() }),
      });
      const data = await r.json() as { keywords: string[]; query: string } | { error: string };
      if ("error" in data) throw new Error(data.error);
      setAiKeywords(data.keywords || []);
      setAiActive(true);
    } catch (err) {
      setAiError((err as Error).message || "AI search failed. Please try again.");
    } finally {
      setAiSearching(false);
    }
  }, [aiQuery, aiSearching]);

  const clearAISearch = useCallback(() => {
    setAiActive(false);
    setAiKeywords([]);
    setAiQuery("");
    setAiError("");
  }, []);

  // keep a seen-set ref so dedup works across Load More calls
  const seenTitles = useRef(new Set<string>());

  const mergeInto = useCallback((existing: ExtBook[], incoming: ExtBook[]): ExtBook[] => {
    const next = [...existing];
    for (const b of incoming) {
      const key = b.title?.toLowerCase().trim();
      if (key && !seenTitles.current.has(key)) {
        seenTitles.current.add(key);
        next.push(b);
      }
    }
    return next;
  }, []);

  // initial load: fetch main books (600 + books-small) + stream page 1 in parallel
  useEffect(() => {
    setLoading(true);
    setError(false);
    seenTitles.current = new Set();

    Promise.allSettled([
      fetch("/api/external-books", { credentials: "include" }).then(r => r.json()) as Promise<ExtBook[]>,
      fetch("/api/external-books-stream?page=1", { credentials: "include" })
        .then(r => r.json()) as Promise<{ page: number; books: ExtBook[]; hasMore: boolean }>,
    ]).then(([mainResult, streamResult]) => {
      const main: ExtBook[] = mainResult.status === "fulfilled" && Array.isArray(mainResult.value) ? mainResult.value : [];
      const streamData = streamResult.status === "fulfilled" && streamResult.value?.books ? streamResult.value : { books: [], hasMore: false };

      const merged = mergeInto(mergeInto([], main), streamData.books);
      if (merged.length === 0) setError(true);
      else setBooks(merged);
      setHasMore(streamData.hasMore);
      setStreamPage(1);
    }).catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [mergeInto]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = streamPage + 1;
      const r = await fetch(`/api/external-books-stream?page=${nextPage}`, { credentials: "include" });
      const data = await r.json() as { page: number; books: ExtBook[]; hasMore: boolean };
      if (data.books?.length) {
        setBooks(prev => mergeInto(prev, data.books));
      }
      setHasMore(data.hasMore ?? false);
      setStreamPage(nextPage);
    } catch {
      // silently ignore load more errors
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, streamPage, mergeInto]);

  const filtered = aiActive
    ? books.filter(b => {
        const haystack = `${b.title} ${b.author || ""}`.toLowerCase();
        return aiKeywords.some(kw => haystack.includes(kw));
      })
    : books.filter(b =>
        !search ||
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        (b.author && b.author.toLowerCase().includes(search.toLowerCase()))
      );

  const { isAuthenticated, tokens, deductPdfToken } = useAuth();
  const isPdfDepleted = isAuthenticated && !!tokens && tokens.balance <= 0;

  const handleSelectBook = useCallback((book: ExtBook) => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "pdf" } }));
      return;
    }
    if (isPdfDepleted) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "tokens" } }));
      return;
    }
    void deductPdfToken();
    setSelectedBook(book);
  }, [isAuthenticated, isPdfDepleted, deductPdfToken]);

  const proxyUrl = (pdf: string) =>
    `/api/external-pdf?url=${encodeURIComponent(pdf)}`;

  if (selectedBook) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#0a0c14] shrink-0">
          <button onClick={() => setSelectedBook(null)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-xs font-semibold text-white truncate flex-1">{selectedBook.title}</p>
          <a href={selectedBook.pdf} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="flex-1 min-h-0">
          <PdfReader url={proxyUrl(selectedBook.pdf)} title={selectedBook.title} />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 max-w-6xl mx-auto"
    >
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6"
        style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.13) 0%, rgba(5,150,105,0.10) 50%, rgba(6,95,70,0.08) 100%)", border: "1px solid rgba(16,185,129,0.25)" }}>
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-2xl shrink-0"
            style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.35)" }}>
            <Globe className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-display font-black text-white">Books Library</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {books.length > 0 ? `${books.length.toLocaleString()}+ books` : "2,600+ books"} · Self-help, Business, Academic, Fiction &amp; More · Free PDF reading
            </p>
          </div>
        </div>
      </div>

      {/* ── AI Search Section ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(109,40,217,0.07) 100%)", border: "1px solid rgba(139,92,246,0.25)" }}>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-violet-300">AI Book Search</span>
            <span className="text-[10px] text-muted-foreground bg-violet-500/15 border border-violet-500/25 px-2 py-0.5 rounded-full ml-1">Qwen 3.5 122B</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Wand2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400/60" />
              <input
                type="text"
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAISearch(); } }}
                placeholder="e.g. quantum physics, leadership, African history, machine learning…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
              />
            </div>
            <button
              onClick={handleAISearch}
              disabled={!aiQuery.trim() || aiSearching}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              style={{ background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.45)" }}
            >
              {aiSearching ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">Searching…</span></>
              ) : (
                <><Sparkles className="w-4 h-4" /><span className="hidden sm:inline">Search</span></>
              )}
            </button>
          </div>
          {aiError && (
            <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{aiError}
            </p>
          )}
        </div>

        {/* AI results banner */}
        <AnimatePresence>
          {aiActive && aiKeywords.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-violet-500/20"
            >
              <div className="px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-semibold text-white">
                      {filtered.length} book{filtered.length !== 1 ? "s" : ""} matched
                      {hasMore && <span className="text-muted-foreground font-normal"> · Load more pages below for a wider search</span>}
                    </span>
                  </div>
                  <button onClick={clearAISearch}
                    className="p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {aiKeywords.slice(0, 30).map((kw, i) => (
                    <span key={i}
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "rgba(196,181,253,0.9)" }}>
                      <Hash className="w-2.5 h-2.5" />{kw}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Regular search — hidden while AI search is active */}
      {!aiActive && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search books by title or author…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-white/10">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <span className="text-sm">Loading books…</span>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm">Could not load books. Check your connection.</span>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {aiActive
            ? <>No books matched "<span className="text-violet-300">{aiQuery}</span>" in the currently loaded pages. Try loading more books below.</>
            : <>No books found matching "{search}"</>
          }
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div>
          {/* Category sections when browsing all; flat grid when searching */}
          {!aiActive && !search ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">All Books by Category</h3>
                <span className="text-xs text-muted-foreground">— {books.length.toLocaleString()} books across {BOOK_CATEGORIES_ORDER.length} categories</span>
              </div>
              {BOOK_CATEGORIES_ORDER.map((cat, i) => {
                const catBooks = filtered.filter(b => guessBookCategory(b.title) === cat);
                if (catBooks.length === 0) return null;
                return (
                  <BookCategorySection
                    key={cat}
                    category={cat}
                    books={catBooks}
                    onSelect={handleSelectBook}
                    defaultOpen={i === 0}
                  />
                );
              })}
              {/* Load More / All loaded — beneath category sections */}
              {hasMore ? (
                <div className="flex justify-center pt-4">
                  <button onClick={loadMore} disabled={loadingMore}
                    className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)" }}>
                    {loadingMore ? (
                      <><Loader2 className="w-4 h-4 animate-spin text-emerald-400" /><span className="text-emerald-300">Loading more books…</span></>
                    ) : (
                      <><ChevronDown className="w-4 h-4 text-emerald-400" /><span className="text-emerald-300">Load More Books</span><span className="text-[11px] text-muted-foreground ml-1">(+2,000 more)</span></>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground pt-3">All {books.length.toLocaleString()} books loaded across all categories</p>
              )}
            </div>
          ) : (
            <div>
              {aiActive ? (
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <p className="text-xs text-violet-300 font-medium">AI results for "{aiQuery}" — {filtered.length} book{filtered.length !== 1 ? "s" : ""}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-3">{filtered.length} result{filtered.length !== 1 ? "s" : ""} for "{search}"</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filtered.map((book, i) => (
                  <motion.button
                    key={`${book.title}-${i}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.4) }}
                    onClick={() => handleSelectBook(book)}
                    className="group flex flex-col rounded-xl p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex items-center justify-center w-full aspect-[3/4] rounded-lg mb-2 relative overflow-hidden"
                      style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))", border: "1px solid rgba(16,185,129,0.2)" }}>
                      <FileText className="w-8 h-8 text-emerald-400/60 group-hover:text-emerald-400 transition-colors" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-1.5 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px] font-bold text-white bg-emerald-500/80 px-2 py-0.5 rounded-full">Read</span>
                      </div>
                    </div>
                    <p className="text-[11px] font-semibold text-white leading-tight line-clamp-2 group-hover:text-emerald-300 transition-colors">
                      {book.title.replace(/ PDF.*/i, "").replace(/\s+by\s+.*/i, "")}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 opacity-70">{book.author || "PDF Book"}</p>
                  </motion.button>
                ))}
              </div>
              {aiActive && hasMore && (
                <div className="flex justify-center pt-4">
                  <button onClick={loadMore} disabled={loadingMore}
                    className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                    style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)" }}>
                    {loadingMore ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Loading…</span></> : <><ChevronDown className="w-4 h-4" /><span>Load More Results</span></>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Genre Section (500 per genre with Load More) ──────────────────────────────

const GENRE_PAGE = 500;

function NovelGenreSection({
  genre, onRead, getEntry, defaultOpen,
}: {
  genre: string;
  onRead: (n: Novel) => void;
  getEntry: (id: number) => ReadingEntry | undefined;
  defaultOpen: boolean;
}) {
  const gs = GENRE_STYLES[genre];
  const [open, setOpen] = useState(defaultOpen);
  const [novels, setNovels] = useState<Novel[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (offset: number) => {
    const isFirst = offset === 0;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/novels?genre=${encodeURIComponent(genre)}&limit=${GENRE_PAGE}&offset=${offset}`,
        { credentials: "include" }
      );
      const data = await res.json() as { novels: Novel[]; total: number; hasMore: boolean };
      if (isFirst) {
        setNovels(data.novels ?? []);
      } else {
        setNovels(prev => [...prev, ...(data.novels ?? [])]);
      }
      setTotal(data.total ?? 0);
      setLoaded(true);
    } catch {
      if (isFirst) { setNovels([]); setLoaded(true); }
    } finally {
      if (isFirst) setLoading(false); else setLoadingMore(false);
    }
  }, [genre]);

  const handleOpen = useCallback(() => {
    setOpen(v => {
      const next = !v;
      if (next && !loaded) { void fetchPage(0); }
      return next;
    });
  }, [loaded, fetchPage]);

  useEffect(() => {
    if (defaultOpen && !loaded) { void fetchPage(0); }
  }, [defaultOpen, loaded, fetchPage]);

  const hasMore = novels.length < total;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        style={{ background: open ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg shrink-0">{GENRE_EMOJIS[genre] ?? "📚"}</span>
          <span className="text-sm font-bold text-white">{genre}</span>
          {loaded && (
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.07)" }}>
              {total.toLocaleString()} book{total !== 1 ? "s" : ""}
            </span>
          )}
          {gs && (
            <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: gs.bg, color: gs.text, border: `1px solid ${gs.border}` }}>
              {genre}
            </span>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="p-3 space-y-3 border-t border-white/8" style={{ background: "rgba(0,0,0,0.12)" }}>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/6 animate-pulse" style={{ height: 220, background: "rgba(255,255,255,0.03)" }} />
              ))}
            </div>
          ) : novels.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No books in this genre yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {novels.map(novel => (
                  <NovelCard key={novel.id} novel={novel} onRead={onRead} readingEntry={getEntry(novel.id)} />
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  {novels.length.toLocaleString()} of {total.toLocaleString()} books shown
                </span>
                {hasMore && (
                  <button
                    onClick={() => fetchPage(novels.length)}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    style={{ background: gs ? `${gs.bg.replace("0.12","0.2")}` : "rgba(99,102,241,0.15)", border: `1px solid ${gs?.border ?? "rgba(99,102,241,0.35)"}` }}
                  >
                    {loadingMore ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</>
                    ) : (
                      <><ChevronDown className="w-3.5 h-3.5" /> Load More ({Math.min(GENRE_PAGE, total - novels.length).toLocaleString()} more)</>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

const NOVELS_PAGE_SIZE = 24;

export default function NovelsTab() {
  const { isAuthenticated, tokens, deductPdfToken } = useAuth();
  const isPdfDepleted = isAuthenticated && !!tokens && tokens.balance <= 0;
  const [activeTab, setActiveTab] = useState<"novels" | "books">("novels");
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All");
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(NOVELS_PAGE_SIZE);

  const { list, markOpened, updatePage, markFinished, markReading, remove, getEntry } = useReadingList();

  const trackNovelReading = useCallback(async (novel: Novel, finished = false) => {
    if (!isAuthenticated) return;
    try {
      await fetch("/api/xp/track-reading", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType: "novel", resourceId: novel.id, title: novel.title, finished }),
      });
    } catch {}
  }, [isAuthenticated]);

  const fetchNovels = useCallback(async (q: string, g: string, feat: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("search", q.trim());
      if (g && g !== "All") params.set("genre", g);
      if (feat) params.set("featured", "true");
      const res = await fetch(`/api/novels?${params}`, { credentials: "include" });
      const data = await res.json() as { novels: Novel[] };
      setNovels(Array.isArray(data.novels) ? data.novels : []);
    } catch {
      setNovels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchNovels(search, genre, featuredOnly);
      setVisibleCount(NOVELS_PAGE_SIZE);
    }, 300);
    return () => clearTimeout(t);
  }, [search, genre, featuredOnly, fetchNovels]);

  const openNovel = useCallback((novel: Novel) => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "pdf" } }));
      return;
    }
    if (isPdfDepleted) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "tokens" } }));
      return;
    }
    void deductPdfToken();
    const isNew = !getEntry(novel.id);
    markOpened(novel);
    setSelectedNovel(novel);
    if (isNew) void trackNovelReading(novel, false);
  }, [markOpened, getEntry, trackNovelReading, isAuthenticated, isPdfDepleted, deductPdfToken]);

  const openFromList = useCallback((entry: ReadingEntry) => {
    setSelectedNovel({
      id: entry.id, title: entry.title, author: entry.author,
      genre: entry.genre, featured: entry.featured, fileSizeKb: null,
    });
  }, []);

  const handleToggleFinished = useCallback((id: number) => {
    const entry = getEntry(id);
    if (entry?.status === "finished") {
      markReading(id);
    } else {
      markFinished(id);
      if (entry) {
        const novelObj: Novel = { id: entry.id, title: entry.title, author: entry.author, genre: entry.genre, featured: entry.featured, fileSizeKb: null };
        void trackNovelReading(novelObj, true);
      }
    }
  }, [getEntry, markFinished, markReading, trackNovelReading]);

  const featured = novels.filter(n => n.featured);

  const selectedEntry = selectedNovel ? getEntry(selectedNovel.id) : undefined;

  return (
    <>
      <AnimatePresence>
        {selectedNovel && (
          <NovelReader
            novel={selectedNovel}
            initialPage={selectedEntry?.lastPage || 1}
            onClose={() => setSelectedNovel(null)}
            onPageChange={page => updatePage(selectedNovel.id, page)}
            onMarkFinished={() => { markFinished(selectedNovel.id); void trackNovelReading(selectedNovel, true); }}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-5 max-w-6xl mx-auto"
      >
        {/* ── Tab Toggle ── */}
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <button
            onClick={() => setActiveTab("novels")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "novels"
                ? "bg-indigo-500/20 text-indigo-300 shadow-sm"
                : "text-muted-foreground hover:text-white"
            )}
          >
            <Library className="w-4 h-4" /> Novels
          </button>
          <button
            onClick={() => setActiveTab("books")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "books"
                ? "bg-emerald-500/20 text-emerald-300 shadow-sm"
                : "text-muted-foreground hover:text-white"
            )}
          >
            <Globe className="w-4 h-4" /> Books
          </button>
        </div>

        {/* ── Books Library ── */}
        {activeTab === "books" && <BooksLibrary />}

        {/* ── Novels section ── */}
        {activeTab === "novels" && <>
        {/* ── Reading List ── */}
        <ReadingListSection
          list={list}
          onResume={openFromList}
          onToggleFinished={handleToggleFinished}
          onRemove={remove}
        />

        {/* ── Resource Search ── */}
        <ResourceSearch placeholder="Search books, notes, green books, or study resources…" />

        {/* ── Search + Featured ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title or author…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-white/10">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <button
            onClick={() => setFeaturedOnly(v => !v)}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all shrink-0",
              featuredOnly ? "text-yellow-300" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white"
            )}
            style={featuredOnly
              ? { background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }
              : { background: "rgba(255,255,255,0.03)" }
            }
          >
            <Star className={cn("w-3.5 h-3.5", featuredOnly ? "fill-yellow-400 text-yellow-400" : "")} />
            Featured
          </button>
        </div>

        {/* ── Genre pills ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {GENRES.map(g => {
            const gs = GENRE_STYLES[g];
            const isActive = genre === g;
            return (
              <button key={g} onClick={() => setGenre(g)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all shrink-0 border"
                style={isActive && gs
                  ? { background: gs.bg, border: `1px solid ${gs.border}`, color: gs.text }
                  : isActive
                    ? { background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }
                    : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-muted-foreground)" }
                }
              >
                <span>{GENRE_EMOJIS[g]}</span>{g}
              </button>
            );
          })}
        </div>

        {/* ── Featured row ── */}
        {genre === "All" && !search && !featuredOnly && featured.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <h3 className="text-sm font-bold text-white">Featured Picks</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {featured.slice(0, 6).map(novel => (
                <NovelCard key={novel.id} novel={novel} onRead={openNovel} readingEntry={getEntry(novel.id)} />
              ))}
            </div>
          </div>
        )}

        {/* ── All results: genre sections when browsing all, flat list when filtering ── */}
        {genre === "All" && !search && !featuredOnly ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">All Books by Genre</h3>
              <span className="text-xs text-muted-foreground">— 500 per genre, expand to browse</span>
            </div>
            {GENRES.filter(g => g !== "All").map((g, i) => (
              <NovelGenreSection
                key={g}
                genre={g}
                onRead={openNovel}
                getEntry={getEntry}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">
                {novels.length} result{novels.length !== 1 ? "s" : ""}
                {genre !== "All" ? ` in ${genre}` : ""}
              </h3>
              {loading && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/6 animate-pulse"
                    style={{ height: 240, background: "rgba(255,255,255,0.03)" }} />
                ))}
              </div>
            ) : novels.length === 0 ? (
              <div className="rounded-2xl border border-white/6 p-12 text-center"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <Library className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-semibold text-white">No books found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different genre or clear your search</p>
                <button onClick={() => { setSearch(""); setGenre("All"); setFeaturedOnly(false); }}
                  className="mt-3 px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
                  style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {novels.slice(0, visibleCount).map(novel => (
                    <NovelCard key={novel.id} novel={novel} onRead={openNovel} readingEntry={getEntry(novel.id)} />
                  ))}
                </div>
                {visibleCount < novels.length && (
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={() => setVisibleCount(v => v + NOVELS_PAGE_SIZE)}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)" }}
                    >
                      <ChevronDown className="w-4 h-4 text-indigo-400" />
                      <span className="text-indigo-300">Show More</span>
                      <span className="text-[11px] text-muted-foreground ml-1">({novels.length - visibleCount} remaining)</span>
                    </button>
                  </div>
                )}
                {visibleCount >= novels.length && novels.length > NOVELS_PAGE_SIZE && (
                  <p className="text-center text-xs text-muted-foreground pt-3">All {novels.length} books shown</p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tip ── */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
          <FileText className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-white">Progress is saved automatically</strong> — your last page is remembered per book.
            Use the zoom slider or <kbd className="px-1 py-0.5 rounded text-[10px] font-mono" style={{ background: "rgba(255,255,255,0.1)" }}>Ctrl+Scroll</kbd> to zoom.
            Pinch to zoom on touch devices. Arrow keys turn pages.
          </p>
        </div>
        </>}
      </motion.div>
    </>
  );
}
