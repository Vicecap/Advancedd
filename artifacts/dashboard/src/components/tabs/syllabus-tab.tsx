import React, { useState, useEffect } from "react";
import {
  Search,
  X,
  Loader2,
  AlertCircle,
  GraduationCap,
  BookOpen,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import PdfReader from "@/components/pdf-reader";
import ResourceSearch from "@/components/resource-search";
import { useAuth } from "@/hooks/use-auth";

// ── New API shape ──────────────────────────────────────────────
interface ApiItem {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  type: string;
  subject: string | null;
  category: string | null;
  publisher: string | null;
  publication_year: number | null;
  edition: string | null;
  isbn: string | null;
  language: string;
  grade_level: string | null;
  exam_board: string | null;
  tags: string[];
  status: string;
  page_count: number | null;
  pdf_size_bytes: number | null;
  has_cached_pdf: boolean;
  book_page_url: string | null;
  formats: {
    pdf: string | null;
    epub: string | null;
    txt: string | null;
    html: string | null;
  };
  created_at: string;
  updated_at: string;
}

// ── Internal Normalised Shape ──────────────────────────────────
interface SyllabusItem {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  level: string | null;
  source: string | null;
  pdf: string;
}

const SUBJECT_COLORS: Record<
  string,
  { color: string; bg: string; border: string; emoji: string }
> = {
  Mathematics: {
    color: "#818cf8",
    bg: "rgba(129,140,248,0.12)",
    border: "rgba(129,140,248,0.3)",
    emoji: "📐",
  },
  Math: {
    color: "#818cf8",
    bg: "rgba(129,140,248,0.12)",
    border: "rgba(129,140,248,0.3)",
    emoji: "📐",
  },
  Physics: {
    color: "#38bdf8",
    bg: "rgba(56,189,248,0.12)",
    border: "rgba(56,189,248,0.3)",
    emoji: "⚛️",
  },
  Chemistry: {
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.3)",
    emoji: "🧪",
  },
  Biology: {
    color: "#4ade80",
    bg: "rgba(74,222,128,0.12)",
    border: "rgba(74,222,128,0.3)",
    emoji: "🧬",
  },
  "Computer Science": {
    color: "#f472b6",
    bg: "rgba(244,114,182,0.12)",
    border: "rgba(244,114,182,0.3)",
    emoji: "💻",
  },
  Computer: {
    color: "#f472b6",
    bg: "rgba(244,114,182,0.12)",
    border: "rgba(244,114,182,0.3)",
    emoji: "💻",
  },
  Geography: {
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.12)",
    border: "rgba(251,191,36,0.3)",
    emoji: "🌍",
  },
  History: {
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
    border: "rgba(251,146,60,0.3)",
    emoji: "📜",
  },
  Accounting: {
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.12)",
    border: "rgba(167,139,250,0.3)",
    emoji: "📊",
  },
  "Business Studies": {
    color: "#2dd4bf",
    bg: "rgba(45,212,191,0.12)",
    border: "rgba(45,212,191,0.3)",
    emoji: "💼",
  },
  English: {
    color: "#f9a8d4",
    bg: "rgba(249,168,212,0.12)",
    border: "rgba(249,168,212,0.3)",
    emoji: "📝",
  },
  Science: {
    color: "#6ee7b7",
    bg: "rgba(110,231,183,0.12)",
    border: "rgba(110,231,183,0.3)",
    emoji: "🔬",
  },
  General: {
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
    border: "rgba(148,163,184,0.3)",
    emoji: "📚",
  },
};

function getSubjectStyle(subject: string | null) {
  if (!subject) return SUBJECT_COLORS.General;
  return SUBJECT_COLORS[subject] ?? SUBJECT_COLORS.General;
}

// Derive a display subject from item fields
function deriveSubject(item: SyllabusItem): string {
  if (item.subject) return item.subject;
  // Try to detect from title
  const t = item.title.toLowerCase();
  if (t.includes("math")) return "Mathematics";
  if (t.includes("physics")) return "Physics";
  if (t.includes("chem")) return "Chemistry";
  if (t.includes("bio")) return "Biology";
  if (t.includes("computer") || t.includes("cs")) return "Computer Science";
  if (t.includes("english")) return "English";
  if (t.includes("geog")) return "Geography";
  if (t.includes("hist")) return "History";
  if (t.includes("account")) return "Accounting";
  if (t.includes("science")) return "Science";
  return "General";
}

// Convert ApiItem to our normalized structure
function normaliseItem(raw: ApiItem): SyllabusItem {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    subject: raw.subject,
    level: raw.grade_level,
    source: raw.publisher ?? null,
    pdf: raw.formats?.pdf ?? "",
  };
}

function SyllabusCard({
  item,
  onOpen,
}: {
  item: SyllabusItem;
  onOpen: (item: SyllabusItem) => void;
}) {
  const subject = deriveSubject(item);
  const style = getSubjectStyle(subject);

  const pdfUrl = item.pdf || "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-3.5 border border-white/8 flex flex-col gap-2.5 hover:border-white/15 transition-all group"
      style={{ background: "rgba(10,12,28,0.6)" }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: style.bg, border: `1px solid ${style.border}` }}
        >
          {style.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-white leading-snug line-clamp-2">
            {item.title}
          </p>
          <p className="text-[10px] mt-0.5 capitalize" style={{ color: style.color }}>
            {subject}
          </p>
          {item.level && item.level !== "General" && item.level !== "Unknown" && (
            <p className="text-[9px] mt-0.5 opacity-50">{item.level}</p>
          )}
          {item.description && (
            <p className="text-[9px] mt-0.5 opacity-40 line-clamp-1">
              {item.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold capitalize truncate max-w-[100px]"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "var(--color-muted-foreground)",
          }}
          title={item.source || "Unknown Source"}
        >
          {item.source || "General"}
        </span>
        <button
          onClick={() => onOpen(item)}
          disabled={!pdfUrl}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all",
            !pdfUrl && "opacity-40 cursor-not-allowed"
          )}
          style={{
            background: style.bg,
            border: `1px solid ${style.border}`,
            color: style.color,
          }}
        >
          <BookOpen className="w-3 h-3" />
          {pdfUrl ? "Read" : "N/A"}
        </button>
      </div>
    </motion.div>
  );
}

export default function SyllabusTab() {
  const { isAuthenticated } = useAuth();

  const [items, setItems] = useState<SyllabusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeSubject, setActiveSubject] = useState("All");
  const [activeLevel, setActiveLevel] = useState("All");
  const [openItem, setOpenItem] = useState<SyllabusItem | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  function handleOpenItem(item: SyllabusItem) {
    if (!isAuthenticated) {
      window.dispatchEvent(
        new CustomEvent("open-auth-modal", { detail: { reason: "pdf" } })
      );
      return;
    }
    setOpenItem(item);
  }

  function parseResponse(res: any): SyllabusItem[] {
    if (res && res.data && Array.isArray(res.data)) {
      return (res.data as ApiItem[]).map(normaliseItem);
    }
    if (Array.isArray(res)) {
      return (res as ApiItem[]).map(normaliseItem);
    }
    return [];
  }

  useEffect(() => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);

    setError("");

    fetch(`/api/external-syllabus?page=${page}&limit=${LIMIT}`)
      .then((r) => r.json())
      .then((res) => {
        const newItems = parseResponse(res);

        setItems((prev) => (page === 1 ? newItems : [...prev, ...newItems]));

        // Handle pagination object if it exists
        if (res.pagination) {
          setTotal(res.pagination.total);
          setHasMore(res.pagination.has_next);
        } else {
          // Fallback
          setTotal((prev) => (page === 1 ? newItems.length : prev));
          setHasMore(newItems.length === LIMIT);
        }
      })
      .catch(() => setError("Could not load syllabus"))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [page]);

  // Derive subjects from loaded items for filter pills
  const subjects = [
    "All",
    ...Array.from(new Set(items.map((i) => deriveSubject(i)))).sort(),
  ];

  // Derive levels for filter
  const levels = [
    "All",
    ...Array.from(
      new Set(
        items.map((i) => i.level).filter((l) => l && l !== "Unknown" && l !== "General")
      )
    ).sort(),
  ];

  const filtered = items.filter((item) => {
    const subject = deriveSubject(item);
    const matchSub = activeSubject === "All" || subject === activeSubject;
    const matchLevel = activeLevel === "All" || item.level === activeLevel;
    const matchSearch =
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      subject.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()));

    return matchSub && matchLevel && matchSearch;
  });

  return (
    <>
      <AnimatePresence>
        {openItem && (
          <PdfReader
            url={`/api/external-pdf?url=${encodeURIComponent(openItem.pdf)}`}
            title={openItem.title}
            subtitle={`${deriveSubject(openItem)} Syllabus`}
            accentColor={getSubjectStyle(deriveSubject(openItem)).color}
            onClose={() => setOpenItem(null)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col h-full min-h-0 gap-4"
      >
        {/* AI Resource Search */}
        <ResourceSearch placeholder="Search syllabus, books, notes, or library…" />

        {/* Header */}
        <div
          className="rounded-2xl p-4 shrink-0"
          style={{
            background: "rgba(14,17,35,0.7)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(244,114,182,0.3), rgba(167,139,250,0.2))",
                border: "1px solid rgba(244,114,182,0.3)",
              }}
            >
              <GraduationCap className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white">Syllabus</h2>
              <p className="text-[11px] text-muted-foreground">
                {total > 0 ? `${total} documents available` : "Loading documents..."}
              </p>
            </div>
          </div>

          {/* Subject filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: "none" }}>
            {subjects.map((s) => {
              const st = s === "All" ? null : getSubjectStyle(s);
              const isActive = activeSubject === s;
              return (
                <button
                  key={s}
                  onClick={() => setActiveSubject(s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all shrink-0 border"
                  style={
                    isActive && st
                      ? { background: st.bg, border: `1px solid ${st.border}`, color: st.color }
                      : isActive
                      ? {
                          background: "rgba(99,102,241,0.2)",
                          border: "1px solid rgba(99,102,241,0.4)",
                          color: "#a5b4fc",
                        }
                      : {
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "var(--color-muted-foreground)",
                        }
                  }
                >
                  {s !== "All" && st && <span>{st.emoji}</span>}
                  {s}
                </button>
              );
            })}
          </div>

          {/* Level filter pills */}
          {levels.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: "none" }}>
              {levels.map((l) => (
                <button
                  key={l}
                  onClick={() => setActiveLevel(l)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 border"
                  style={
                    activeLevel === l
                      ? {
                          background: "rgba(99,102,241,0.2)",
                          border: "1px solid rgba(99,102,241,0.4)",
                          color: "#a5b4fc",
                        }
                      : {
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "var(--color-muted-foreground)",
                        }
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search syllabi…"
              className="w-full pl-9 pr-8 py-2 rounded-xl text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-white/20"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && page === 1 ? (
            <div className="flex flex-col items-center gap-3 mt-16">
              <Loader2 className="w-7 h-7 animate-spin text-pink-400" />
              <p className="text-sm text-muted-foreground">Loading syllabus…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 mt-16 text-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-white font-semibold">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 mt-16 text-center">
              <GraduationCap className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-white font-semibold">No syllabus found</p>
              {(search || activeSubject !== "All" || activeLevel !== "All") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setActiveSubject("All");
                    setActiveLevel("All");
                  }}
                  className="mt-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
                  style={{
                    background: "rgba(99,102,241,0.2)",
                    border: "1px solid rgba(99,102,241,0.3)",
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                {filtered.map((item) => (
                  <SyllabusCard key={item.id} item={item} onOpen={handleOpenItem} />
                ))}
              </div>

              {/* Load More Button */}
              {hasMore && !search && activeSubject === "All" && activeLevel === "All" && (
                <div className="flex items-center justify-center pt-2 pb-8">
                  <button
                    onClick={() => setPage((p) => p + 2)}
                    disabled={loadingMore}
                    className={cn(
                      "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all border",
                      loadingMore ? "opacity-60 cursor-not-allowed" : "hover:bg-white/10"
                    )}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "white",
                    }}
                  >
                    {loadingMore ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                    {loadingMore ? "Loading more..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
