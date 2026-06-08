import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2, Sparkles, BookOpen, FileText, Layers, GraduationCap, Library } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import PdfReader from "@/components/pdf-reader";

export interface ResourceItem {
  title: string;
  url: string;
  source: "books" | "notes" | "greenbooks" | "library" | "syllabus";
  subject?: string;
}

interface ResourceSearchProps {
  placeholder?: string;
}

const SOURCE_META: Record<ResourceItem["source"], { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  books:      { label: "Books Library",  icon: BookOpen,    color: "#fbbf24", bg: "rgba(251,191,36,0.1)",   border: "rgba(251,191,36,0.25)" },
  notes:      { label: "Study Notes",    icon: FileText,    color: "#6ee7b7", bg: "rgba(16,185,129,0.1)",   border: "rgba(16,185,129,0.25)" },
  greenbooks: { label: "Green Books",    icon: Layers,      color: "#2dd4bf", bg: "rgba(20,184,166,0.1)",   border: "rgba(20,184,166,0.25)" },
  library:    { label: "Study Library",  icon: Library,     color: "#818cf8", bg: "rgba(129,140,248,0.1)",  border: "rgba(129,140,248,0.25)" },
  syllabus:   { label: "Syllabus",       icon: GraduationCap, color: "#f472b6", bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.25)" },
};

function proxyUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("/")) return rawUrl;
  return `/api/external-pdf?url=${encodeURIComponent(rawUrl)}`;
}

export default function ResourceSearch({ placeholder = "Search all resources…" }: ResourceSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResourceItem[]>([]);
  const [allResources, setAllResources] = useState<ResourceItem[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [openItem, setOpenItem] = useState<ResourceItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetched = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetched.current) return;
    fetched.current = true;
    setLoadingResources(true);
    try {
      const [books, notes, green, syllabus, library] = await Promise.allSettled([
        fetch("/api/v1/documents").then(r => r.json()),
        fetch("/api/v1/documents?type=notes").then(r => r.json()),
        fetch("/api/v1/documents?type=green_book").then(r => r.json()),
        fetch("/api/v1/documents?type=past_paper").then(r => r.json()),
        fetch("/api/v1/documents").then(r => r.json()),
      ]);

      const all: ResourceItem[] = [];

      if (books.status === "fulfilled" && Array.isArray(books.value)) {
        books.value.forEach((b: { title: string; pdf: string }) => {
          if (b.title && b.pdf) all.push({ title: b.title, url: b.pdf, source: "books" });
        });
      }
      if (notes.status === "fulfilled" && Array.isArray(notes.value)) {
        notes.value.forEach((n: { title: string; url?: string; file?: string }) => {
          const u = n.url || n.file || "";
          if (n.title && u) all.push({ title: n.title, url: u, source: "notes" });
        });
      }
      if (green.status === "fulfilled" && Array.isArray(green.value)) {
        green.value.forEach((g: { title: string; url: string }) => {
          if (g.title && g.url) all.push({ title: g.title, url: g.url, source: "greenbooks" });
        });
      }
      if (syllabus.status === "fulfilled" && Array.isArray(syllabus.value)) {
        syllabus.value.forEach((s: { title: string; pdf: string; subject?: string }) => {
          if (s.title && s.pdf) all.push({ title: s.title, url: s.pdf, source: "syllabus", subject: s.subject });
        });
      }
      if (library.status === "fulfilled") {
        const items = Array.isArray(library.value) ? library.value : (library.value?.resources ?? []);
        items.forEach((r: { title: string; id: number; subject?: string }) => {
          if (r.title && r.id) all.push({ title: r.title, url: `/api/v1/documents/${r.id}/download`, source: "library", subject: r.subject });
        });
      }
      setAllResources(all);
    } finally {
      setLoadingResources(false);
    }
  }, []);

  useEffect(() => {
    if (expanded && allResources.length === 0) fetchAll();
  }, [expanded, allResources.length, fetchAll]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    const hits = allResources.filter(r => r.title.toLowerCase().includes(q)).slice(0, 40);
    setResults(hits);
  }, [query, allResources]);

  const handleAiSearch = async () => {
    if (!query.trim() || allResources.length === 0) return;
    setAiLoading(true);
    setAiError("");
    try {
      const sampleTitles = allResources
        .filter(r => r.title.toLowerCase().includes(query.toLowerCase().split(" ")[0]))
        .map(r => r.title)
        .slice(0, 120)
        .join(", ");
      const prompt = `From this list of educational resources: "${sampleTitles || allResources.map(r => r.title).slice(0, 100).join(", ")}"

The student is looking for: "${query}"

List the exact resource titles (from the list) most relevant to this query, one per line. Return only titles, no extra text. Return at most 15 titles.`;
      const resp = await fetch("/api/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], model: "qwen2.5:7b" }),
      });
      const data = await resp.json() as { content: string };
      const suggested = data.content.split("\n").map((l: string) => l.replace(/^[-*•\d.]+\s*/, "").trim()).filter(Boolean);
      const aiHits = suggested
        .map((s: string) => allResources.find(r => r.title.toLowerCase() === s.toLowerCase()))
        .filter(Boolean) as ResourceItem[];
      if (aiHits.length > 0) setResults(aiHits);
    } catch {
      setAiError("AI search failed. Showing keyword results.");
    } finally {
      setAiLoading(false);
    }
  };

  const grouped = results.reduce<Record<string, ResourceItem[]>>((acc, r) => {
    (acc[r.source] ??= []).push(r);
    return acc;
  }, {});

  if (openItem) {
    return (
      <PdfReader
        url={proxyUrl(openItem.url)}
        title={openItem.title}
        subtitle={SOURCE_META[openItem.source].label}
        accentColor={SOURCE_META[openItem.source].color}
        onClose={() => setOpenItem(null)}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-white/8 overflow-visible" style={{ background: "rgba(14,17,35,0.7)" }}>
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors"
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))", border: "1px solid rgba(99,102,241,0.3)" }}>
          <Sparkles className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="text-left min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white">AI Resource Search</p>
          <p className="text-[10px] text-muted-foreground">Search books, notes, green books & study library at once</p>
        </div>
        <ChevronIcon expanded={expanded} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-3">
              {/* Search input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAiSearch()}
                    placeholder={placeholder}
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                  {query && (
                    <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleAiSearch}
                  disabled={!query.trim() || aiLoading || loadingResources}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.3))", border: "1px solid rgba(99,102,241,0.4)" }}>
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Ask AI</span>
                </button>
              </div>

              {loadingResources && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading all resources…
                </div>
              )}

              {aiError && <p className="text-[11px] text-amber-400">{aiError}</p>}

              {/* Results */}
              {Object.entries(grouped).map(([source, items]) => {
                const meta = SOURCE_META[source as ResourceItem["source"]];
                const Icon = meta.icon;
                return (
                  <div key={source}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className="w-3 h-3" style={{ color: meta.color }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</span>
                      <span className="text-[9px] text-muted-foreground/50">({items.length})</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {items.slice(0, 8).map((item, i) => (
                        <button key={i} onClick={() => setOpenItem(item)}
                          className="text-left px-3 py-2 rounded-xl text-[12px] text-white hover:bg-white/8 transition-colors border border-transparent hover:border-white/8 truncate"
                          style={{ background: "rgba(255,255,255,0.02)" }}>
                          {item.title}
                          {item.subject && <span className="ml-1.5 text-[10px] text-muted-foreground">· {item.subject}</span>}
                        </button>
                      ))}
                      {items.length > 8 && (
                        <p className="text-[10px] text-muted-foreground/50 pl-3">+{items.length - 8} more — refine your search</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {query && results.length === 0 && !loadingResources && (
                <p className="text-[12px] text-muted-foreground text-center py-4">
                  No resources found for "<strong className="text-white">{query}</strong>" — try AI search for smarter results.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
