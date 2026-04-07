import React, { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, X, Minus, Plus, Loader2, AlertCircle, Bookmark, BookmarkCheck, BookMarked } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.1;
const READING_LIST_KEY = "pdf-reading-list";

function pageKey(url: string) {
  return `pdf-pos-${encodeURIComponent(url).slice(0, 80)}`;
}

function loadSavedPage(url: string): number {
  try {
    const raw = localStorage.getItem(pageKey(url));
    if (!raw) return 1;
    const { page } = JSON.parse(raw);
    return typeof page === "number" && page >= 1 ? page : 1;
  } catch { return 1; }
}

function savePage(url: string, page: number) {
  try {
    localStorage.setItem(pageKey(url), JSON.stringify({ page, ts: Date.now() }));
  } catch { /* quota */ }
}

interface ReadingListEntry {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  addedAt: number;
  lastPage?: number;
  lastRead?: number;
}

function getReadingList(): ReadingListEntry[] {
  try { return JSON.parse(localStorage.getItem(READING_LIST_KEY) || "[]"); }
  catch { return []; }
}

function saveReadingList(list: ReadingListEntry[]) {
  localStorage.setItem(READING_LIST_KEY, JSON.stringify(list));
}

interface PdfReaderProps {
  url: string;
  title: string;
  subtitle?: string;
  accentColor?: string;
  onClose?: () => void;
}

export default function PdfReader({ url, title, subtitle, accentColor = "#6ee7b7", onClose }: PdfReaderProps) {
  const savedPage = loadSavedPage(url);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(savedPage);
  const [zoom, setZoom] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showReadingList, setShowReadingList] = useState(false);
  const [readingList, setReadingList] = useState<ReadingListEntry[]>(() => getReadingList());
  const [saved, setSaved] = useState(() => getReadingList().some(e => e.url === url));
  const [resumeBanner, setResumeBanner] = useState(savedPage > 1);
  const [swipeFlash, setSwipeFlash] = useState<"left" | "right" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const swipeFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +v.toFixed(2)));
  const pageWidth = containerWidth ? containerWidth * 0.9 * zoom : undefined;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (resumeBanner) {
      const t = setTimeout(() => setResumeBanner(false), 3500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [resumeBanner]);

  const updateListProgress = useCallback((p: number) => {
    const list = getReadingList();
    const idx = list.findIndex(e => e.url === url);
    if (idx >= 0) {
      list[idx] = { ...list[idx], lastPage: p, lastRead: Date.now() };
      saveReadingList(list);
      setReadingList([...list]);
    }
  }, [url]);

  const changePage = useCallback((next: number) => {
    setPage(next);
    savePage(url, next);
    updateListProgress(next);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [url, updateListProgress]);

  const handleToggleSave = () => {
    const list = getReadingList();
    if (saved) {
      const next = list.filter(e => e.url !== url);
      saveReadingList(next);
      setReadingList(next);
      setSaved(false);
    } else {
      const entry: ReadingListEntry = { id: url, title, subtitle, url, addedAt: Date.now(), lastPage: page, lastRead: Date.now() };
      const next = [entry, ...list.filter(e => e.url !== url)];
      saveReadingList(next);
      setReadingList(next);
      setSaved(true);
    }
  };

  const handleRemoveFromList = (entryUrl: string) => {
    const next = readingList.filter(e => e.url !== entryUrl);
    saveReadingList(next);
    setReadingList(next);
    if (entryUrl === url) setSaved(false);
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => clamp(z + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));
    }
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), zoom };
      swipeRef.current = null; // cancel swipe when pinching
    } else if (e.touches.length === 1) {
      swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      swipeRef.current = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setZoom(clamp(pinchRef.current.zoom * (Math.hypot(dx, dy) / pinchRef.current.dist)));
    }
  }, []);

  const flashSwipe = useCallback((dir: "left" | "right") => {
    if (swipeFlashTimer.current) clearTimeout(swipeFlashTimer.current);
    setSwipeFlash(dir);
    swipeFlashTimer.current = setTimeout(() => setSwipeFlash(null), 500);
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!swipeRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    const dt = Date.now() - swipeRef.current.t;
    swipeRef.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 1.2 || dt > 700) return;
    if (dx < 0) {
      // swipe left → next page
      setPage(p => {
        const next = Math.min(numPages || 1, p + 1);
        if (next !== p) { savePage(url, next); updateListProgress(next); flashSwipe("left"); }
        return next;
      });
    } else {
      // swipe right → previous page
      setPage(p => {
        const prev = Math.max(1, p - 1);
        if (prev !== p) { savePage(url, prev); updateListProgress(prev); flashSwipe("right"); }
        return prev;
      });
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [numPages, url, updateListProgress, flashSwipe]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") changePage(Math.min(numPages || 1, page + 1));
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   changePage(Math.max(1, page - 1));
      if ((e.ctrlKey || e.metaKey) && e.key === "=") { e.preventDefault(); setZoom(z => clamp(z + ZOOM_STEP)); }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); setZoom(z => clamp(z - ZOOM_STEP)); }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); setZoom(1.0); }
      if (e.key === "Escape") { if (showReadingList) setShowReadingList(false); else onClose?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages, page, changePage, onClose, showReadingList]);

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
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-white transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
            📄
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-white truncate">{title}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Zoom strip */}
        <div className="flex items-center gap-0.5 shrink-0 px-1.5 py-1 rounded-xl"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={() => setZoom(z => clamp(z - ZOOM_STEP))}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors" title="Zoom out">
            <Minus className="w-3 h-3" />
          </button>
          <input type="range" min={MIN_ZOOM * 100} max={MAX_ZOOM * 100} step={5}
            value={Math.round(zoom * 100)}
            onChange={e => setZoom(clamp(Number(e.target.value) / 100))}
            className="w-16 sm:w-24 accent-indigo-500 cursor-pointer" />
          <button onClick={() => setZoom(z => clamp(z + ZOOM_STEP))}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors" title="Zoom in">
            <Plus className="w-3 h-3" />
          </button>
          <button onClick={() => setZoom(1.0)}
            className="px-1.5 py-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors text-[11px] font-mono font-semibold min-w-[2.8rem] text-center">
            {Math.round(zoom * 100)}%
          </button>
        </div>

        {/* Reading list toggle */}
        <button onClick={() => setShowReadingList(v => !v)}
          className="p-2 rounded-xl hover:bg-white/10 transition-colors shrink-0 relative"
          style={{ color: showReadingList ? accentColor : "hsl(var(--muted-foreground))" }}
          title="Reading list">
          <BookMarked className="w-4 h-4" />
          {readingList.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center"
              style={{ background: accentColor, color: "#000" }}>
              {readingList.length > 9 ? "9+" : readingList.length}
            </span>
          )}
        </button>

        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-white transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Hint bar ── */}
      <div className="shrink-0 flex items-center justify-center gap-3 py-1 px-4 text-[10px] text-muted-foreground/40 border-b border-white/4"
        style={{ background: "rgba(7, 9, 18, 0.5)" }}>
        <span className="hidden sm:inline">
          <kbd className="px-1 rounded text-[9px] font-mono" style={{ background: "rgba(255,255,255,0.07)" }}>Ctrl+Scroll</kbd> zoom
        </span>
        <span className="sm:hidden">Pinch to zoom</span>
        <span className="sm:hidden">· Swipe ← → to turn pages</span>
        <span className="hidden sm:inline">
          <kbd className="px-1 rounded text-[9px] font-mono" style={{ background: "rgba(255,255,255,0.07)" }}>← →</kbd> pages
        </span>
        <span className="hidden md:inline">
          <kbd className="px-1 rounded text-[9px] font-mono" style={{ background: "rgba(255,255,255,0.07)" }}>Esc</kbd> close
        </span>
      </div>

      {/* ── Resume banner ── */}
      <AnimatePresence>
        {resumeBanner && !loading && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="shrink-0 flex items-center justify-between gap-3 px-4 py-2"
            style={{ background: `rgba(${accentColor === "#6ee7b7" ? "16,185,129" : "251,191,36"},0.12)`, borderBottom: `1px solid rgba(${accentColor === "#6ee7b7" ? "16,185,129" : "251,191,36"},0.2)` }}>
            <p className="text-[11px] font-semibold" style={{ color: accentColor }}>
              📖 Resuming from page {savedPage}
            </p>
            <button onClick={() => { changePage(1); setResumeBanner(false); }}
              className="text-[10px] text-muted-foreground hover:text-white transition-colors">
              Start from beginning
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main: PDF + Reading List panel ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">

        {/* Swipe direction flash overlay */}
        <AnimatePresence>
          {swipeFlash && (
            <motion.div
              key={swipeFlash}
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              className="absolute inset-0 z-20 flex items-center pointer-events-none"
              style={{ justifyContent: swipeFlash === "left" ? "flex-end" : "flex-start" }}>
              <div className="m-6 p-4 rounded-2xl flex items-center gap-2"
                style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)" }}>
                {swipeFlash === "right" && <ChevronLeft className="w-6 h-6 text-white" />}
                <span className="text-sm font-bold text-white">{swipeFlash === "left" ? "Next page" : "Prev page"}</span>
                {swipeFlash === "left" && <ChevronRight className="w-6 h-6 text-white" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PDF scroll area */}
        <div ref={scrollRef}
          className="flex-1 overflow-auto flex items-start justify-center py-4 px-1"
          style={{ touchAction: "pan-x pan-y" }}>
          {error ? (
            <div className="flex flex-col items-center gap-4 mt-20 text-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-white">Could not load PDF</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
              </div>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.4)" }}>
                Go Back
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full">
              {loading && (
                <div className="flex flex-col items-center gap-3 mt-20">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: accentColor }} />
                  <p className="text-sm text-muted-foreground">Loading <strong className="text-white">{title}</strong>…</p>
                </div>
              )}
              <Document
                file={url}
                onLoadSuccess={({ numPages }) => { setNumPages(numPages); setLoading(false); }}
                onLoadError={err => { setError(err.message || "Failed to load PDF"); setLoading(false); }}
                loading="">
                <Page
                  pageNumber={page}
                  width={pageWidth}
                  className="shadow-2xl shadow-black/60 rounded-xl overflow-hidden"
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                />
              </Document>
            </div>
          )}
        </div>

        {/* ── Reading list slide-in panel ── */}
        <AnimatePresence>
          {showReadingList && (
            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute right-0 top-0 bottom-0 w-72 sm:w-80 flex flex-col border-l border-white/8 overflow-hidden z-10"
              style={{ background: "rgba(7, 9, 18, 0.97)", backdropFilter: "blur(20px)" }}>
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/8">
                <div className="flex items-center gap-2">
                  <BookMarked className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-sm font-bold text-white">Reading List</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: "rgba(255,255,255,0.08)", color: accentColor }}>
                    {readingList.length}
                  </span>
                </div>
                <button onClick={() => setShowReadingList(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-2">
                {readingList.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 mt-12 text-center px-4">
                    <BookMarked className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground/50 leading-relaxed">
                      No items saved yet. Navigate to the last page of any document and tap <strong>"Save to Reading List"</strong>.
                    </p>
                  </div>
                ) : (
                  readingList.map(entry => (
                    <div key={entry.url}
                      className="rounded-xl p-3 border border-white/8 flex flex-col gap-1"
                      style={{ background: entry.url === url ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-white leading-tight truncate">{entry.title}</p>
                          {entry.subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{entry.subtitle}</p>}
                        </div>
                        <button onClick={() => handleRemoveFromList(entry.url)}
                          className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground/50 hover:text-red-400 transition-colors shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {entry.lastPage && entry.lastPage > 1 && (
                        <p className="text-[10px] font-semibold" style={{ color: accentColor }}>
                          📖 Page {entry.lastPage}
                          {entry.lastRead && ` · ${new Date(entry.lastRead).toLocaleDateString()}`}
                        </p>
                      )}
                      <p className="text-[9px] text-muted-foreground/30">
                        Saved {new Date(entry.addedAt).toLocaleDateString()}
                      </p>
                      {entry.url === url && (
                        <p className="text-[9px] font-semibold" style={{ color: accentColor }}>Currently reading</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer navigation ── */}
      {!loading && !error && numPages > 0 && (
        <div className="shrink-0 border-t border-white/8" style={{ background: "rgba(7, 9, 18, 0.9)" }}>
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <button
              onClick={() => changePage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-30 hover:bg-white/10 disabled:cursor-not-allowed border border-white/10 transition-all">
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            <div className="flex items-center gap-1.5">
              <input type="number" min={1} max={numPages} value={page}
                onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= numPages) changePage(v); }}
                className="w-12 text-center text-sm font-bold text-white rounded-lg px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} />
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

          {/* Last page: Save to Reading List */}
          {page === numPages && (
            <div className="flex items-center justify-center pb-2.5">
              <button onClick={handleToggleSave}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[12px] font-semibold transition-all"
                style={saved
                  ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: accentColor }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "hsl(var(--muted-foreground))" }}>
                {saved
                  ? <><BookmarkCheck className="w-3.5 h-3.5" /> Saved to Reading List</>
                  : <><Bookmark className="w-3.5 h-3.5" /> Save to Reading List</>}
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
