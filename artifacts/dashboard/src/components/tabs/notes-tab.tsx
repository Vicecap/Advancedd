import React, { useState, useEffect, useCallback } from "react";
import {
  BookOpen, Search, X, FileText, Loader2,
  AlertCircle, Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import PdfReader from "@/components/pdf-reader";
import ResourceSearch from "@/components/resource-search";
import { useAuth } from "@/hooks/use-auth";

interface NoteItem {
  title: string;
  file?: string;
  url?: string;
}

interface BookItem {
  title: string;
  url: string;
}

function proxyUrl(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  return `/api/external-pdf?url=${encodeURIComponent(raw)}`;
}

function NoteCard({
  item,
  type,
  onView,
}: {
  item: NoteItem | BookItem;
  type: "note" | "greenbook";
  onView: (item: NoteItem | BookItem, url: string) => void;
}) {
  const color = type === "note" ? "text-emerald-400" : "text-teal-400";
  const bg = type === "note" ? "rgba(16,185,129,0.1)" : "rgba(20,184,166,0.1)";
  const border = type === "note" ? "rgba(16,185,129,0.25)" : "rgba(20,184,166,0.25)";

  const rawUrl = (item as NoteItem).url || (item as NoteItem).file || (item as BookItem).url || "";
  const pUrl = proxyUrl(rawUrl);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-3.5 border border-white/8 flex flex-col gap-2.5 hover:border-white/15 transition-all"
      style={{ background: "rgba(10,12,28,0.6)" }}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg, border: `1px solid ${border}` }}>
          {type === "note" ? <FileText className={cn("w-4 h-4", color)} /> : <Layers className={cn("w-4 h-4", color)} />}
        </div>
        <p className="text-[12px] font-semibold text-white leading-snug flex-1 line-clamp-3">{item.title}</p>
      </div>

      <button
        onClick={() => onView(item, pUrl)}
        disabled={!rawUrl}
        className={cn(
          "w-full py-2 rounded-xl text-[12px] font-semibold transition-all border",
          rawUrl ? "text-white hover:bg-white/10" : "text-muted-foreground/40 cursor-not-allowed"
        )}
        style={rawUrl ? { background: bg, border: `1px solid ${border}` } : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {rawUrl ? "Read" : "Unavailable"}
      </button>
    </motion.div>
  );
}

export default function NotesTab() {
  const { isAuthenticated, tokens, deductPdfToken } = useAuth();
  const isPdfDepleted = isAuthenticated && !!tokens && tokens.balance <= 0;
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [greenBooks, setGreenBooks] = useState<BookItem[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingGreen, setLoadingGreen] = useState(true);
  const [errorNotes, setErrorNotes] = useState("");
  const [errorGreen, setErrorGreen] = useState("");
  const [activeSection, setActiveSection] = useState<"notes" | "greenbooks">("notes");
  const [search, setSearch] = useState("");
  const [selectedUrl, setSelectedUrl] = useState("");
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedSubtitle, setSelectedSubtitle] = useState("");

  useEffect(() => {
    fetch("/api/external-notes")
      .then(r => r.json())
      .then((data: NoteItem[]) => { setNotes(Array.isArray(data) ? data : []); })
      .catch(() => setErrorNotes("Could not load notes"))
      .finally(() => setLoadingNotes(false));

    fetch("/api/external-green-books")
      .then(r => r.json())
      .then((data: BookItem[]) => { setGreenBooks(Array.isArray(data) ? data : []); })
      .catch(() => setErrorGreen("Could not load green books"))
      .finally(() => setLoadingGreen(false));
  }, []);

  const handleView = useCallback((item: NoteItem | BookItem, url: string) => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "pdf" } }));
      return;
    }
    if (isPdfDepleted) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "tokens" } }));
      return;
    }
    void deductPdfToken();
    setSelectedUrl(url);
    setSelectedTitle(item.title);
    setSelectedSubtitle(activeSection === "notes" ? "Study Note" : "Green Book");
  }, [activeSection, isAuthenticated, isPdfDepleted, deductPdfToken]);

  const q = search.toLowerCase();
  const filteredNotes = notes.filter(n => n.title.toLowerCase().includes(q));
  const filteredGreen = greenBooks.filter(b => b.title.toLowerCase().includes(q));

  const isLoading = activeSection === "notes" ? loadingNotes : loadingGreen;
  const error = activeSection === "notes" ? errorNotes : errorGreen;
  const items = activeSection === "notes" ? filteredNotes : filteredGreen;
  const accentColor = activeSection === "notes" ? "#6ee7b7" : "#2dd4bf";

  return (
    <>
      <AnimatePresence>
        {selectedUrl && (
          <PdfReader
            url={selectedUrl}
            title={selectedTitle}
            subtitle={selectedSubtitle}
            accentColor={accentColor}
            onClose={() => setSelectedUrl("")}
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
        <ResourceSearch placeholder="Find notes, green books, books, or library resources…" />

        {/* Header */}
        <div className="rounded-2xl p-4 shrink-0"
          style={{ background: "rgba(14,17,35,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.3), rgba(20,184,166,0.2))", border: "1px solid rgba(16,185,129,0.3)" }}>
              <BookOpen className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white">Notes & Green Books</h2>
              <p className="text-[11px] text-muted-foreground">{notes.length} notes · {greenBooks.length} green books</p>
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex gap-2 mb-3">
            {[
              { id: "notes" as const, label: "Study Notes", count: notes.length, color: "emerald" },
              { id: "greenbooks" as const, label: "Green Books", count: greenBooks.length, color: "teal" },
            ].map(s => (
              <button key={s.id} onClick={() => { setActiveSection(s.id); setSearch(""); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all",
                  activeSection === s.id
                    ? s.color === "emerald"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                    : "bg-white/5 text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white"
                )}>
                <Layers className="w-3 h-3" />
                {s.label}
                <span className="text-[10px] opacity-70">({s.count})</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${activeSection === "notes" ? "notes" : "green books"}…`}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-white/20"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 mt-16">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
              <p className="text-sm text-muted-foreground">
                Loading {activeSection === "notes" ? "study notes" : "green books"}…
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 mt-16 text-center px-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-white font-semibold">{error}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 mt-16 text-center px-4">
              <BookOpen className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-white font-semibold">No results found</p>
              {search && <p className="text-xs text-muted-foreground">Try a different search term</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
              {items.map((item, i) => (
                <NoteCard
                  key={i}
                  item={item}
                  type={activeSection === "notes" ? "note" : "greenbook"}
                  onView={handleView}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
