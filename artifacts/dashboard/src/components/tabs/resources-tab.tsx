import React, { useState, useEffect, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import {
  FileText, ScrollText, Layers, Search, Loader2,
  ChevronLeft, ChevronRight, ChevronDown,
  ZoomIn, ZoomOut, X,
  Send, Upload, GraduationCap,
  Sparkles, FileUp, CheckCircle, AlertCircle,
  ClipboardList, PenLine, ListChecks, BookOpen,
} from "lucide-react";
import ResourceSearch from "@/components/resource-search";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useGuestTokens } from "@/hooks/use-guest-tokens";
import { useResourceUpload } from "@/hooks/use-resource-upload";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface StudyResource {
  id: number;
  title: string;
  board: string;
  category: string;
  subject: string;
  year: number | null;
  level: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  description: string | null;
  createdAt: string;
}

interface AiMessage {
  role: "user" | "assistant";
  text: string;
}

type MCQAnswer = "A" | "B" | "C" | "D" | "";
type PaperMode = "mcq" | "written";
type RightPanel = "ai" | "answers" | null;

const CHOICES: MCQAnswer[] = ["A", "B", "C", "D"];

const CATEGORIES = [
  { id: "past_papers", label: "Past Papers", icon: FileText },
  { id: "green_books", label: "Green Books", icon: ScrollText },
  { id: "textbooks", label: "Textbooks", icon: Layers },
];

const FREE_RESOURCE_MODELS = [
  { id: "llama3.2:3b", label: "Llama 3.2 3B (Free · Fast)" },
  { id: "qwen2.5:latest", label: "Qwen 2.5 (Free · Balanced)" },
  { id: "qwen2.5:7b", label: "Qwen 2.5 7B (Free · Smart)" },
];
function isFreeResourceModel(m: string) { return FREE_RESOURCE_MODELS.some(f => f.id === m); }

const CAT_COLORS: Record<string, string> = {
  past_papers: "text-orange-400",
  green_books: "text-emerald-400",
  textbooks: "text-violet-400",
};

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { upload, progress } = useResourceUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({
    title: "", board: "zimsec" as "zimsec" | "cambridge",
    category: "past_papers" as "past_papers" | "green_books" | "textbooks",
    subject: "Mathematics", year: "", description: "",
  });

  const handleFile = (f: File) => {
    setFile(f);
    if (!meta.title) setMeta(m => ({ ...m, title: f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    try {
      await upload(file, { ...meta, year: meta.year ? parseInt(meta.year, 10) : undefined });
      setTimeout(() => { onSuccess(); onClose(); }, 1000);
    } catch {}
  };

  const done = progress.stage === "done";
  const busy = ["requesting", "uploading", "saving"].includes(progress.stage);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-[#0d1117] border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20 text-primary border border-primary/30"><FileUp className="w-5 h-5" /></div>
            <h2 className="font-bold text-white text-lg">Upload Study Resource</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
            className={cn("border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
              file ? "border-primary/40 bg-primary/5" : "border-white/15 hover:border-primary/30")}>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {file ? (
              <div><FileText className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-white">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtSize(file.size)}</p></div>
            ) : (
              <div><Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-white font-medium">Drop a file or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOC — up to 50 MB</p></div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Title *</label>
            <input required value={meta.title} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
              placeholder="e.g. Mathematics Paper 1 2023"
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Board *</label>
              <select value={meta.board} onChange={e => setMeta(m => ({ ...m, board: e.target.value as "zimsec" | "cambridge" }))}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50">
                <option value="zimsec">ZIMSEC</option><option value="cambridge">Cambridge</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Category *</label>
              <select value={meta.category} onChange={e => setMeta(m => ({ ...m, category: e.target.value as "past_papers" | "green_books" | "textbooks" }))}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50">
                <option value="past_papers">Past Papers</option><option value="green_books">Green Books</option><option value="textbooks">Textbooks</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Subject *</label>
              <select value={meta.subject} onChange={e => setMeta(m => ({ ...m, subject: e.target.value }))}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50">
                {["Mathematics","Physics","Chemistry","Biology","English Language","History","Geography","Commerce","Accounts","Economics","Computer Science","Agriculture"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Year</label>
              <input type="number" min="1990" max="2030" value={meta.year} onChange={e => setMeta(m => ({ ...m, year: e.target.value }))}
                placeholder="e.g. 2023"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
            </div>
          </div>
          {progress.stage !== "idle" && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>{progress.stage === "done" ? "Upload complete!" : progress.stage === "error" ? progress.error : "Uploading..."}</span>
                {!done && progress.stage !== "error" && <span>{progress.percent}%</span>}
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-300", progress.stage === "error" ? "bg-red-500" : done ? "bg-green-500" : "bg-primary")} style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 text-sm text-muted-foreground hover:text-white transition-all">Cancel</button>
            <button type="submit" disabled={!file || busy || done}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/80 transition-all">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload</>}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ResourceRow({ resource, isActive, onClick }: {
  resource: StudyResource;
  isActive: boolean;
  onClick: () => void;
}) {
  const CatIcon = CATEGORIES.find(c => c.id === resource.category)?.icon ?? FileText;
  const catColor = CAT_COLORS[resource.category] ?? "text-slate-400";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-xl transition-all flex items-start gap-3 group",
        isActive ? "bg-primary/15 border border-primary/30" : "hover:bg-white/5 border border-transparent"
      )}
    >
      <CatIcon className={cn("w-4 h-4 mt-0.5 shrink-0", catColor)} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium leading-snug truncate", isActive ? "text-primary" : "text-white/90 group-hover:text-white")}>
          {resource.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">{resource.subject}</span>
          {resource.year && <span className="text-xs text-muted-foreground/60">· {resource.year}</span>}
          {resource.description && <span className="text-xs text-muted-foreground/60 truncate">· {resource.description}</span>}
        </div>
      </div>
    </button>
  );
}

/* ── Answer Sheet panel (desktop: right sidebar, mobile: bottom sheet) ── */
function AnswerPanel({
  resource, isMobile, inline, onClose, onSendToAi,
}: {
  resource: StudyResource;
  isMobile: boolean;
  inline?: boolean;
  onClose: () => void;
  onSendToAi: (prompt: string) => void;
}) {
  const [mode, setMode] = useState<PaperMode>("mcq");
  const [questionCount, setQuestionCount] = useState(20);
  const [mcqAnswers, setMcqAnswers] = useState<MCQAnswer[]>(Array(60).fill(""));
  const [writtenAnswers, setWrittenAnswers] = useState<string[]>(Array(15).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setMcq = (i: number, v: MCQAnswer) =>
    setMcqAnswers(prev => { const a = [...prev]; a[i] = v; return a; });
  const setWritten = (i: number, v: string) =>
    setWrittenAnswers(prev => { const a = [...prev]; a[i] = v; return a; });

  const handleSubmit = () => {
    setSubmitting(true);
    const doc = `Document: "${resource.title}" (${resource.subject}${resource.year ? `, ${resource.year}` : ""})`;
    let prompt = "";
    if (mode === "mcq") {
      const list = Array.from({ length: questionCount }, (_, i) => `Q${i + 1}: ${mcqAnswers[i] || "—"}`).join("  ");
      prompt = `${doc}\n\nStudent multiple-choice answers:\n${list}\n\nFor each question, comment on whether the answer is likely correct. Provide the expected answer where possible, give an estimated score and any study tips.`;
    } else {
      const list = Array.from({ length: questionCount }, (_, i) =>
        `Question ${i + 1}:\n${writtenAnswers[i] || "(blank)"}`).join("\n\n---\n\n");
      prompt = `${doc}\n\nStudent written answers:\n\n${list}\n\nGive detailed feedback on each answer — accuracy, structure, language. For essays, comment on argument and grammar. Estimate a mark for each and suggest improvements.`;
    }
    setTimeout(() => { onSendToAi(prompt); setSubmitting(false); setSubmitted(true); }, 300);
  };

  const answeredCount = mode === "mcq"
    ? mcqAnswers.slice(0, questionCount).filter(a => a !== "").length
    : writtenAnswers.slice(0, questionCount).filter(a => a.trim() !== "").length;

  const inner = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-white">Answer Sheet</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode + count */}
      <div className="px-4 py-3 border-b border-white/8 space-y-3 shrink-0">
        <div className="flex rounded-xl overflow-hidden border border-white/10 text-xs font-semibold">
          <button onClick={() => { setMode("mcq"); setSubmitted(false); }}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 transition-all",
              mode === "mcq" ? "bg-emerald-500/20 text-emerald-400" : "text-muted-foreground hover:text-white hover:bg-white/5")}>
            <ListChecks className="w-3.5 h-3.5" /> MCQ
          </button>
          <button onClick={() => { setMode("written"); setQuestionCount(q => Math.min(q, 15)); setSubmitted(false); }}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 transition-all",
              mode === "written" ? "bg-violet-500/20 text-violet-400" : "text-muted-foreground hover:text-white hover:bg-white/5")}>
            <PenLine className="w-3.5 h-3.5" /> Written / Essay
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Questions:</label>
          <input type="number" min={1} max={mode === "mcq" ? 60 : 15}
            value={questionCount}
            onChange={e => { setQuestionCount(Math.max(1, Math.min(mode === "mcq" ? 60 : 15, parseInt(e.target.value) || 1))); setSubmitted(false); }}
            className="w-16 bg-white/5 border border-white/15 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-primary/50" />
          <span className="text-xs text-muted-foreground ml-auto">{answeredCount}/{questionCount} answered</span>
        </div>
      </div>

      {/* Answers */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {mode === "mcq" ? (
          <div className="px-3 py-3 space-y-1">
            {Array.from({ length: questionCount }, (_, i) => (
              <div key={i} className={cn("flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all",
                mcqAnswers[i] ? "bg-emerald-500/5" : "hover:bg-white/3")}>
                <span className="text-xs text-muted-foreground w-6 shrink-0 text-right tabular-nums">{i + 1}.</span>
                <div className="flex gap-1 flex-1">
                  {CHOICES.map(ch => (
                    <button key={ch} onClick={() => setMcq(i, mcqAnswers[i] === ch ? "" : ch)}
                      className={cn("flex-1 h-8 rounded-lg text-xs font-bold transition-all border",
                        mcqAnswers[i] === ch
                          ? "bg-emerald-500 text-white border-emerald-400 shadow-sm shadow-emerald-500/30"
                          : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20")}>
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3 space-y-4">
            {Array.from({ length: questionCount }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-violet-400">Question {i + 1}</span>
                  {(writtenAnswers[i] ?? "").trim() && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <textarea value={writtenAnswers[i] ?? ""}
                  onChange={e => { setWritten(i, e.target.value); setSubmitted(false); }}
                  placeholder="Write your answer here…"
                  rows={isMobile ? 3 : (i < 2 ? 5 : 3)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-violet-500/40 resize-y transition-colors leading-relaxed" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="px-4 py-3 border-t border-white/10 shrink-0 space-y-2">
        {submitted && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            Sent to AI Tutor — check AI panel for feedback.
          </div>
        )}
        <button onClick={handleSubmit} disabled={submitting || answeredCount === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-emerald-500 transition-all">
          {submitting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            : <><Sparkles className="w-4 h-4" /> Submit for AI {mode === "mcq" ? "Marking" : "Feedback"}</>}
        </button>
      </div>
    </>
  );

  /* Inline variant — used in mobile split‑screen */
  if (inline) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-[#080b12]">
        {inner}
      </div>
    );
  }

  if (isMobile) {
    return (
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-40 bg-[#080b12] border-t border-white/15 rounded-t-2xl flex flex-col"
        style={{ maxHeight: "80vh" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        {inner}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 360, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="border-l border-white/10 bg-[#080b12] flex flex-col shrink-0 overflow-hidden"
      style={{ width: 360, minWidth: 0 }}
    >
      {inner}
    </motion.div>
  );
}

/* ── PDF Viewer ── */
function PdfViewer({
  resource, isMobile, onClose,
}: {
  resource: StudyResource;
  isMobile: boolean;
  onClose: () => void;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(isMobile ? 1.0 : 1.2);
  const [containerWidth, setContainerWidth] = useState(isMobile ? 340 : 700);

  const [selectedText, setSelectedText] = useState("");
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(null);

  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [pdfText, setPdfText] = useState("");
  const [selectedModel, setSelectedModel] = useState("qwen2.5:7b");
  const [aiModels, setAiModels] = useState<{ id: string; label: string; recommended?: boolean }[]>([]);

  const [splitRatio, setSplitRatio] = useState(55);
  const containerRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const splitAreaRef = useRef<HTMLDivElement>(null);

  const swipeTouchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.floor(w - (isMobile ? 16 : 32)));
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [isMobile]);

  useEffect(() => {
    setLoadError(null);
    setPdfUrl(null);
    setCurrentPage(1);
    fetch(`/api/v1/documents/${resource.id}/download`, { credentials: "include" })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setPdfUrl(url);
      })
      .catch(() => setLoadError("This file is not available. Try searching for it online."));
    return () => {
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, [resource.id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);

  useEffect(() => {
    fetch("/api/ais", { credentials: "include" })
      .then(r => r.json())
      .then((d: { models: { id: string; label: string; recommended?: boolean }[] }) => {
        if (d.models?.length) { setAiModels(d.models); setSelectedModel(d.models[0].id); }
      })
      .catch(() => {});
  }, []);

  const handleTextSelect = useCallback((e: React.MouseEvent) => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 3) {
      setSelectedText(sel);
      setFloatPos({ x: e.clientX, y: e.clientY });
    } else {
      setFloatPos(null);
    }
  }, []);

  const handleSplitDrag = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const el = splitAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.round(((touch.clientY - rect.top) / rect.height) * 100);
    setSplitRatio(Math.max(25, Math.min(75, ratio)));
  }, []);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeTouchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeTouchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeTouchStart.current.x;
    const dy = t.clientY - swipeTouchStart.current.y;
    swipeTouchStart.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
    if (dx < 0) setCurrentPage(p => Math.min(numPages, p + 1));
    else setCurrentPage(p => Math.max(1, p - 1));
  }, [numPages]);

  const handleFloatAsk = () => {
    setFloatPos(null);
    setRightPanel("ai");
    setAiInput(`Help me with: "${selectedText.slice(0, 300)}"`);
    setTimeout(() => aiInputRef.current?.focus(), 150);
  };

  const sendToAi = useCallback(async (prompt: string) => {
    setRightPanel("ai");
    setAiMessages(m => [...m, { role: "user", text: prompt }]);
    setAiLoading(true);
    const fullPrompt = pdfText
      ? `[Exam Paper Content]\n${pdfText}\n\n---\n\n${prompt}`
      : prompt;
    try {
      const isFree = isFreeResourceModel(selectedModel);
      const endpoint = isFree ? "/api/discuss" : "/api/discuss";
      const body = isFree
        ? { messages: [{ role: "user", content: fullPrompt }], model: selectedModel }
        : { prompt: fullPrompt, ai: selectedModel };
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const data = await res.json() as { response?: string; content?: string; text?: string; error?: string };
      setAiMessages(m => [...m, { role: "assistant", text: data.response ?? data.content ?? data.text ?? data.error ?? "No response." }]);
    } catch {
      setAiMessages(m => [...m, { role: "assistant", text: "Failed to get a response. Please try again." }]);
    } finally { setAiLoading(false); }
  }, [pdfText, selectedModel]);

  const handleAskAi = async () => {
    if (!aiInput.trim()) return;
    const prompt = selectedText
      ? `Context from document "${resource.title}":\n"${selectedText}"\n\nQuestion: ${aiInput}`
      : aiInput;
    setAiInput("");
    await sendToAi(prompt);
  };

  const togglePanel = (panel: RightPanel) => {
    setRightPanel(p => p === panel ? null : panel);
    if (panel === "ai" && selectedText && aiMessages.length === 0) {
      setAiInput(`Help me with: "${selectedText.slice(0, 200)}"`);
    }
  };

  /* Mobile AI panel — full-screen overlay sliding up from bottom */
  const MobileAiPanel = rightPanel === "ai" && isMobile ? (
    <motion.div
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-x-0 bottom-0 z-40 bg-[#0a0c14] border-t border-white/15 rounded-t-2xl flex flex-col"
      style={{ maxHeight: "80vh" }}
    >
      <div className="flex justify-center pt-2 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-white">AI Tutor</span>
          </div>
          <button onClick={() => setRightPanel(null)} className="p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
          className="w-full text-xs bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-white/80 focus:outline-none focus:border-primary/40 cursor-pointer">
          <optgroup label="── Free Models ──" className="bg-[#0a0c14] text-emerald-400">
            {FREE_RESOURCE_MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#0a0c14] text-white">{m.label}</option>)}
          </optgroup>
          {aiModels.length > 0 && (
            <optgroup label="── Premium Models ──" className="bg-[#0a0c14] text-violet-400">
              {aiModels.map(m => <option key={m.id} value={m.id} className="bg-[#0a0c14] text-white">{m.recommended ? `${m.label} ⭐` : m.label}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      {selectedText && (
        <div className="mx-3 mt-3 p-3 rounded-xl bg-primary/5 border border-primary/15 shrink-0">
          <p className="text-xs text-primary/70 font-semibold uppercase tracking-wide mb-1">Selected text</p>
          <p className="text-xs text-white/80 line-clamp-2 italic">"{selectedText.slice(0, 200)}"</p>
          <button onClick={() => setSelectedText("")} className="text-xs text-muted-foreground hover:text-white mt-1.5 transition-colors">Clear</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {aiMessages.length === 0 && (
          <div className="text-center py-6">
            <Sparkles className="w-7 h-7 text-primary/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Highlight text or ask anything about this paper.</p>
          </div>
        )}
        {aiMessages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
              msg.role === "user" ? "bg-primary/20 text-white border border-primary/20" : "bg-white/8 text-white/90 border border-white/10")}>
              {msg.text}
            </div>
          </div>
        ))}
        {aiLoading && (
          <div className="flex justify-start">
            <div className="bg-white/8 border border-white/10 rounded-xl px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="px-3 pb-4 pt-2 border-t border-white/10 shrink-0">
        <div className="flex gap-2">
          <input ref={aiInputRef} value={aiInput} onChange={e => setAiInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAskAi()}
            placeholder={selectedText ? "Ask about selection…" : "Ask anything about this paper…"}
            className="flex-1 bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors" />
          <button onClick={handleAskAi} disabled={!aiInput.trim() || aiLoading}
            className="p-2.5 rounded-xl bg-primary text-white disabled:opacity-40 hover:bg-primary/80 transition-all shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  ) : null;

  return (
    <div className="flex flex-col h-full min-h-0 relative overflow-hidden">
      {/* Floating "Ask AI" bubble */}
      <AnimatePresence>
        {floatPos && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.12 }}
            style={{ position: "fixed", top: floatPos.y - 52, left: Math.min(floatPos.x - 60, window.innerWidth - 180), zIndex: 200 }}
          >
            <div className="flex items-center gap-1 bg-[#1a1f2e] border border-primary/40 rounded-full shadow-xl shadow-black/50 overflow-hidden">
              <button onClick={handleFloatAsk}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/20 transition-all">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Ask AI
              </button>
              <div className="w-px h-5 bg-white/10" />
              <button onClick={() => { setFloatPos(null); setSelectedText(""); }}
                className="px-2 py-1.5 text-muted-foreground hover:text-white transition-all">
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reader toolbar */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#0a0c14] shrink-0",
        isMobile ? "flex-wrap gap-y-1" : ""
      )}>
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className={cn("min-w-0", isMobile ? "flex-1" : "flex-1")}>
          <p className="text-xs font-semibold text-white truncate">{resource.title}</p>
          {!isMobile && <p className="text-xs text-muted-foreground">{resource.subject}{resource.year ? ` · ${resource.year}` : ""}</p>}
        </div>

        {/* Page navigation */}
        {numPages > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-white/70 px-1 tabular-nums">{currentPage}/{numPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Zoom */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.15))}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/60 w-9 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(2.5, s + 0.15))}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Panel toggles */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => togglePanel("answers")}
            className={cn("flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all border",
              rightPanel === "answers"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-white/5 text-white/70 hover:text-white hover:bg-white/10 border-white/10")}>
            <ClipboardList className="w-3.5 h-3.5" />
            {!isMobile && " Answers"}
          </button>
          <button onClick={() => togglePanel("ai")}
            className={cn("flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all border",
              rightPanel === "ai"
                ? "bg-primary/20 text-primary border-primary/30"
                : "bg-white/5 text-white/70 hover:text-white hover:bg-white/10 border-white/10")}>
            <Sparkles className="w-3.5 h-3.5" />
            {!isMobile && (selectedText ? " Ask AI ✦" : " AI Tutor")}
          </button>
        </div>
      </div>

      {/* Main reading area */}
      <div
        ref={splitAreaRef}
        className={cn("flex flex-1 min-h-0 overflow-hidden", isMobile && rightPanel === "answers" ? "flex-col" : "")}
      >
        {/* PDF scroll area — kept mounted always so Document doesn't re-fetch */}
        <div
          ref={containerRef}
          onMouseUp={handleTextSelect}
          onClick={() => setFloatPos(null)}
          onTouchStart={handleSwipeTouchStart}
          onTouchEnd={handleSwipeTouchEnd}
          style={isMobile && rightPanel === "answers" ? { flex: splitRatio } : undefined}
          className={cn("overflow-y-auto overflow-x-auto bg-[#0a0c14] min-h-0 min-w-0", !(isMobile && rightPanel === "answers") && "flex-1")}
        >
          {!pdfUrl && !loadError && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Loading document…</p>
            </div>
          )}
          {loadError && (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
              <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
                <AlertCircle className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-2">File Unavailable</h4>
                <p className="text-sm text-muted-foreground max-w-xs">{loadError}</p>
              </div>
              <a href={`https://www.google.com/search?q=${encodeURIComponent(`zimsec ${resource.subject} ${resource.year ?? ""} ${resource.description ?? ""} pdf`)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition-all">
                Search Google for this paper
              </a>
            </div>
          )}
          {pdfUrl && (
            <div className="flex flex-col items-center py-4 gap-4">
              <Document file={pdfUrl}
                onLoadSuccess={async (pdf: any) => {
                  setNumPages(pdf.numPages);
                  const maxPages = Math.min(pdf.numPages, 25);
                  let text = "";
                  for (let p = 1; p <= maxPages; p++) {
                    try {
                      const page = await pdf.getPage(p);
                      const content = await page.getTextContent();
                      text += content.items.map((it: any) => it.str ?? "").join(" ") + "\n";
                    } catch { /* skip page */ }
                  }
                  setPdfText(text.slice(0, 10000));
                }}
                onLoadError={() => setLoadError("Could not render this document.")}
                loading={
                  <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                    <Loader2 className="w-5 h-5 animate-spin" /> Rendering…
                  </div>
                }>
                <Page
                  pageNumber={currentPage}
                  width={Math.max(100, Math.floor(containerWidth * scale))}
                  renderTextLayer
                  renderAnnotationLayer
                  className="shadow-2xl rounded overflow-hidden"
                />
              </Document>
            </div>
          )}
        </div>

        {/* ── Mobile split‑screen: drag handle + inline answer sheet ── */}
        {isMobile && rightPanel === "answers" && (
          <>
            <div
              className="h-8 bg-[#0d1117] border-y border-white/10 flex items-center justify-center gap-3 shrink-0 select-none"
              style={{ touchAction: "none" }}
              onTouchMove={handleSplitDrag}
            >
              <div className="w-7 h-0.5 rounded-full bg-white/30" />
              <span className="text-[10px] text-white/35 tracking-wide">drag to resize</span>
              <div className="w-7 h-0.5 rounded-full bg-white/30" />
            </div>
            <div style={{ flex: 100 - splitRatio }} className="min-h-0 overflow-hidden flex flex-col">
              <AnswerPanel resource={resource} isMobile={false} inline
                onClose={() => setRightPanel(null)}
                onSendToAi={async prompt => { setRightPanel("ai"); await sendToAi(prompt); }} />
            </div>
          </>
        )}

        {/* Desktop right panels */}
        {!isMobile && (
          <AnimatePresence>
            {rightPanel === "answers" && (
              <AnswerPanel key="answers" resource={resource} isMobile={false} onClose={() => setRightPanel(null)}
                onSendToAi={async prompt => { setRightPanel("ai"); await sendToAi(prompt); }} />
            )}
            {rightPanel === "ai" && (
              <motion.div key="ai"
                initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="border-l border-white/10 bg-[#0a0c14] flex flex-col shrink-0 overflow-hidden"
                style={{ width: 340, minWidth: 0 }}>
                <div className="flex flex-col gap-2 px-4 py-3 border-b border-white/10 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-white">AI Tutor</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setRightPanel("answers")} className="p-1 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Answer Sheet">
                        <ClipboardList className="w-4 h-4" />
                      </button>
                      <button onClick={() => setRightPanel(null)} className="p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                    className="w-full text-xs bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-white/80 focus:outline-none focus:border-primary/40 cursor-pointer">
                    <optgroup label="── Free Models ──" className="bg-[#0a0c14] text-emerald-400">
                      {FREE_RESOURCE_MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#0a0c14] text-white">{m.label}</option>)}
                    </optgroup>
                    {aiModels.length > 0 && (
                      <optgroup label="── Premium Models ──" className="bg-[#0a0c14] text-violet-400">
                        {aiModels.map(m => <option key={m.id} value={m.id} className="bg-[#0a0c14] text-white">{m.recommended ? `${m.label} ⭐` : m.label}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                {selectedText && (
                  <div className="mx-3 mt-3 p-3 rounded-xl bg-primary/5 border border-primary/15 shrink-0">
                    <p className="text-xs text-primary/70 font-semibold uppercase tracking-wide mb-1">Selected from document</p>
                    <p className="text-xs text-white/80 line-clamp-3 italic">"{selectedText.slice(0, 250)}{selectedText.length > 250 ? "…" : ""}"</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => { setAiInput(`Help me solve: "${selectedText.slice(0, 300)}"`); aiInputRef.current?.focus(); }}
                        className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">Use as context →</button>
                      <button onClick={() => setSelectedText("")} className="text-xs text-muted-foreground hover:text-white transition-colors ml-auto">Clear</button>
                    </div>
                  </div>
                )}
                {selectedText && aiMessages.length === 0 && (
                  <div className="px-3 pt-3 space-y-1.5 shrink-0">
                    <p className="text-xs text-muted-foreground font-medium">Quick questions:</p>
                    {[
                      `Help me solve: "${selectedText.slice(0, 70)}"`,
                      `Explain this: "${selectedText.slice(0, 70)}"`,
                      `What is the answer to: "${selectedText.slice(0, 60)}"`,
                    ].map((q, i) => (
                      <button key={i} onClick={() => { setAiInput(q); aiInputRef.current?.focus(); }}
                        className="w-full text-left text-xs text-white/70 px-3 py-2 rounded-lg bg-white/5 hover:bg-primary/10 hover:text-primary border border-white/5 hover:border-primary/20 transition-all truncate">
                        {q.length > 58 ? q.slice(0, 58) + "…" : q}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                  {aiMessages.length === 0 && !selectedText && (
                    <div className="text-center py-8">
                      <BookOpen className="w-8 h-8 text-primary/30 mx-auto mb-3" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Highlight any text and click <strong className="text-white">"Ask AI"</strong> or type a question below.
                      </p>
                    </div>
                  )}
                  {aiMessages.map((msg, i) => (
                    <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
                        msg.role === "user" ? "bg-primary/20 text-white border border-primary/20" : "bg-white/8 text-white/90 border border-white/10")}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/8 border border-white/10 rounded-xl px-3 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="px-3 pb-3 pt-2 border-t border-white/10 shrink-0">
                  <div className="flex gap-2">
                    <input ref={aiInputRef} value={aiInput} onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAskAi()}
                      placeholder={selectedText ? "Ask about selection…" : "Ask anything about this paper…"}
                      className="flex-1 bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors" />
                    <button onClick={handleAskAi} disabled={!aiInput.trim() || aiLoading}
                      className="p-2 rounded-xl bg-primary text-white disabled:opacity-40 hover:bg-primary/80 transition-all shrink-0">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Mobile bottom sheets — AI only; answers are shown inline in split view */}
      {isMobile && (
        <AnimatePresence>
          {MobileAiPanel}
        </AnimatePresence>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

interface ResourcesPage {
  resources: StudyResource[];
  total: number;
  hasMore: boolean;
}

/* ── Main export ── */
export default function ResourcesTab() {
  const { user, isAuthenticated, tokens, deductPdfToken } = useAuth();
  const isPdfDepleted = isAuthenticated && !!tokens && tokens.balance <= 0;
  const { deduct: deductGuestTokens } = useGuestTokens(!isAuthenticated);
  const isMobile = useIsMobile();
  const [resources, setResources] = useState<StudyResource[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [selected, setSelected] = useState<StudyResource | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  async function trackResourceReading(r: StudyResource, finished = false) {
    if (!isAuthenticated) return;
    const categoryMap: Record<string, string> = {
      past_papers: "past_paper", textbooks: "textbook", green_books: "green_book",
    };
    const resourceType = categoryMap[r.category] ?? "textbook";
    try {
      await fetch("/api/xp/track-reading", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType, resourceId: r.id, title: r.title, finished }),
      });
    } catch {}
  }

  function handleSelectResource(r: StudyResource) {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "pdf" } }));
      return;
    }
    if (isPdfDepleted) {
      alert("Your weekly tokens are depleted. Buy more tokens to open PDFs, or wait for your weekly reset.");
      return;
    }
    void deductPdfToken();
    setSelected(r);
    void trackResourceReading(r, false);
  }

  const buildUrl = useCallback((offset: number) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    return `/api/v1/documents?${params}`;
  }, []);

  const fetchResources = useCallback(() => {
    setLoading(true);
    fetch(buildUrl(0), { credentials: "include" })
      .then(r => r.json())
      .then((d: ResourcesPage | { resources?: StudyResource[] } | StudyResource[]) => {
        if (Array.isArray(d)) {
          setResources(d);
          setTotal(d.length);
          setHasMore(false);
        } else if ("hasMore" in d) {
          const page = d as ResourcesPage;
          setResources(page.resources);
          setTotal(page.total);
          setHasMore(page.hasMore);
        } else {
          const list = (d as { resources?: StudyResource[] }).resources ?? [];
          setResources(list);
          setTotal(list.length);
          setHasMore(false);
        }
      })
      .catch(() => { setResources([]); setTotal(0); setHasMore(false); })
      .finally(() => setLoading(false));
  }, [buildUrl]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetch(buildUrl(resources.length), { credentials: "include" })
      .then(r => r.json())
      .then((d: ResourcesPage) => {
        setResources(prev => [...prev, ...d.resources]);
        setTotal(d.total);
        setHasMore(d.hasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, resources.length, buildUrl]);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  const levels = [...new Set(resources.map(r => r.level).filter(Boolean))].sort();
  const filtered = resources.filter(r => {
    if (filterCat !== "all" && r.category !== filterCat) return false;
    if (filterLevel !== "all" && r.level !== filterLevel) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title ?? "").toLowerCase().includes(q)
        || (r.subject ?? "").toLowerCase().includes(q)
        || (r.description ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  /* Mobile: show viewer full-screen when resource is selected */
  if (isMobile && selected) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-[#080b12]">
        <PdfViewer resource={selected} isMobile={true} onClose={() => setSelected(null)} />
      </div>
    );
  }

  const sidebar = (
    <div className="flex flex-col bg-[#080b12] min-h-0 h-full">
      <div className="p-4 border-b border-white/10 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-primary" /> Study Library
          </h2>
          {user && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-semibold hover:bg-primary/30 transition-all border border-primary/20">
              <FileUp className="w-3.5 h-3.5" /> Upload
            </button>
          )}
        </div>
        <ResourceSearch placeholder="Search all resources, books, notes…" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search papers, subjects…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors" />
        </div>
        <div className="flex gap-2">
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none">
            <option value="all">All types</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none">
            <option value="all">All levels</option>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-xs">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">No resources found.</div>
        )}
        {!loading && filtered.map(r => (
          <ResourceRow key={r.id} resource={r} isActive={selected?.id === r.id} onClick={() => handleSelectResource(r)} />
        ))}
        {/* Load More — only show when not filtering locally */}
        {!loading && hasMore && !search && filterCat === "all" && filterLevel === "all" && (
          <div className="pt-3 pb-1">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-white/80 transition-all hover:text-white disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {loadingMore ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Loading more…</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5 text-primary" /> Load more resources</>
              )}
            </button>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-white/10 shrink-0">
        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} shown{total > resources.length ? ` · ${total} total` : ` of ${total}`}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 -mx-4 md:-mx-8 lg:-mx-12 min-h-0 overflow-hidden">
      {/* Sidebar — always visible on desktop, full-screen on mobile when no resource selected */}
      <div className={cn("flex flex-col min-h-0 border-r border-white/10", isMobile ? "w-full" : "w-72 shrink-0")}>
        {sidebar}
      </div>

      {/* Desktop: PDF viewer or welcome */}
      {!isMobile && (
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
          {selected ? (
            <PdfViewer resource={selected} isMobile={false} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
              <div className="p-5 rounded-3xl bg-primary/10 border border-primary/20">
                <BookOpen className="w-12 h-12 text-primary/60" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Pick a document to read</h3>
                <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                  Select any paper from the sidebar. Read it in-browser, highlight text to ask the AI, fill in an answer sheet, and get instant feedback.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full max-w-sm mt-2">
                {[
                  { icon: BookOpen, label: "Read PDFs", desc: "In-browser, no download" },
                  { icon: ClipboardList, label: "Answer Sheet", desc: "MCQ or written answers" },
                  { icon: Sparkles, label: "AI Feedback", desc: "Highlight to ask AI" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/3 border border-white/8">
                    <Icon className="w-5 h-5 text-primary/60" />
                    <p className="text-xs font-semibold text-white/80">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={fetchResources} />}
    </div>
  );
}
