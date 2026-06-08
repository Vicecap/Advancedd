import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, Upload, X, Loader2, Sparkles, BookOpen,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Bot,
  FlaskConical, Star, Hash, Camera, Video, Wand2, Zap, Cpu,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { pdfjs } from "react-pdf";
import { useAuth } from "@/hooks/use-auth";
import { useFreeAIModels } from "@/hooks/use-math-api";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

function logActivity(type: string, description: string, xpEarned: number) {
  fetch(api("/activity"), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, description, xpEarned }),
  }).catch(() => {});
}

const MODES = [
  { id: "help",     label: "Help Me Understand",   desc: "Guide me step-by-step without giving the answer", emoji: "💡" },
  { id: "solve",    label: "Solve For Me",          desc: "Full working with all steps explained",          emoji: "✏️" },
  { id: "review",   label: "Review My Work",        desc: "Check for errors & suggest improvements",        emoji: "🔍" },
  { id: "research", label: "Research This Topic",   desc: "Deep explanation + textbook & past paper refs",  emoji: "📚" },
];

const MODELS = [
  { id: "qwen/qwen3.5-9b",         label: "Qwen Fast",     sub: "Quick help",    recommended: false },
  { id: "qwen/qwen3.5-27b",        label: "Qwen Balanced", sub: "General use",   recommended: false },
  { id: "qwen/qwen3.5-122b-a10b",  label: "Qwen Powerful", sub: "Complex work",  recommended: true  },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small", sub: "Fast & precise", recommended: false },
  { id: "openai/gpt-5.4-mini",     label: "GPT-5.4 Mini",  sub: "OpenAI model",  recommended: false },
];

const SUBJECTS = [
  "", "Mathematics", "Physics", "Chemistry", "Biology",
  "English", "History", "Geography", "Economics", "Computer Science",
  "Agriculture", "Accounts", "Commerce", "Shona", "Literature",
];

interface Resource {
  title: string;
  subject: string;
  category: string;
  year: number | null;
}

interface NewtonResult {
  expression: string;
  operation: string;
  result: string;
}

// ── Math detection helpers ────────────────────────────────────────────────────

/**
 * Returns true only if the text looks like a SINGLE math question that Newton
 * can actually process.  Explicitly excluded:
 *  – numbered lists  ("1) … 2) … 3) …")
 *  – overly long blobs (OCR dumps)
 *  – pure prose / word problems without an expression
 */
function isMathQuestion(text: string): boolean {
  if (!text || text.length < 3) return false;

  // Reject numbered-problem lists ("1)" or "1." appearing more than once)
  const numberedItemCount = (text.match(/\b\d+[)\.]\s/g) || []).length;
  if (numberedItemCount >= 2) return false;

  // Reject if there are multiple lines that each look like separate expressions
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const exprLines = lines.filter(l => /[0-9x]\s*[\+\-\*\/\^=]/.test(l));
  if (exprLines.length >= 3) return false;

  // Reject if the text is too long to be a single expression
  if (text.trim().length > 180) return false;

  // Must contain at least one actual math pattern
  const patterns = [
    /[0-9]+\s*[\+\-\*\/\^=]\s*[0-9x]/,
    /[a-zA-Z]\s*[\+\-\*\^]\s*[0-9]/,
    /\b(solve|simplify|factor|derive|derivative|integrate|differentiate|expand)\b/i,
    /\d+x|\bx\^|\bx²|\bx³|sin\(|cos\(|tan\(|log\(|ln\(|sqrt\(/i,
    /[\+\-]?\d+\/\d+/,
  ];
  if (!patterns.some(p => p.test(text))) return false;

  return true;
}

/**
 * Extracts a single clean expression from user input for Newton.
 * Returns null if the text cannot be reduced to a single safe expression.
 */
function extractForNewton(text: string): { expression: string; operation: string } | null {
  let operation = "simplify";

  if (/\b(derive|derivative|differentiate|d\/dx)\b/i.test(text)) operation = "derive";
  else if (/\b(factor|factorise|factorize)\b/i.test(text)) operation = "factor";
  else if (/\b(integrate|integral|integration)\b/i.test(text)) operation = "integrate";
  else if (/\b(expand)\b/i.test(text)) operation = "expand";

  // Strip English prose words that aren't part of an expression
  let expr = text
    .replace(/\b(solve|find|calculate|compute|what is|evaluate|simplify|factor|derive|integrate|expand|the|of|given|that|if|let|for|when|where|please|help|me|with|this|question|problem)\b/gi, " ")
    .replace(/[,;:.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!expr || expr.length < 2) return null;

  // Extract the longest contiguous math token run
  // A "math token" is anything matching [0-9a-zA-Z+\-*/^()=.\s]
  const mathBlocks = expr.match(/[0-9a-zA-Z\+\-\*\/\^\(\)=\.x\s]{3,}/g) || [];
  if (mathBlocks.length === 0) return null;

  // Pick the block with the most math characters (digits/operators/vars)
  const best = mathBlocks
    .map(b => b.trim())
    .filter(b => b.length >= 2 && /[0-9x]/.test(b) && /[\+\-\*\/\^=]/.test(b))
    .sort((a, b) => b.length - a.length)[0];

  if (!best) return null;

  // Final safety: reject if the cleaned expression is suspiciously long or
  // still looks like it contains multiple sub-problems
  const cleaned = best.replace(/\s+/g, " ").trim();
  if (cleaned.length > 120) return null;
  if ((cleaned.match(/\d+\)/g) || []).length >= 2) return null;

  return { expression: cleaned, operation };
}

// ── File extractors ───────────────────────────────────────────────────────────

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const maxPages = Math.min(pdf.numPages, 20);
  const parts: string[] = [];
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ").replace(/\s+/g, " ").trim();
    if (pageText) parts.push(pageText);
  }
  return parts.join("\n\n").slice(0, 12000);
}

async function ocrImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch("/api/upload-image", { method: "POST", credentials: "include", body: formData });
  if (!res.ok) throw new Error("OCR failed");
  const data = await res.json() as { text: string };
  return data.text;
}

async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeworkTab() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("help");
  const [model, setModel] = useState("qwen/qwen3.5-122b-a10b");
  const [subject, setSubject] = useState("");

  const { tokens, isAuthenticated } = useAuth();
  const isDepleted = !!tokens && tokens.balance <= 0;
  const { data: freeModelsData } = useFreeAIModels();

  const visiblePremiumModels = useMemo(
    () => isAuthenticated ? MODELS : MODELS.filter(m => m.id === "qwen/qwen3.5-9b"),
    [isAuthenticated]
  );

  const allFreeModels = freeModelsData?.models ?? [];
  const isFreeModel = (id: string) => allFreeModels.some(m => m.id === id) || MODELS.every(m => m.id !== id);

  useEffect(() => {
    if (!isAuthenticated && MODELS.some(m => m.id === model) && model !== "qwen/qwen3.5-9b") {
      setModel("qwen/qwen3.5-9b");
    }
  }, [isAuthenticated, model]);

  useEffect(() => {
    if (isDepleted && !isFreeModel(model)) {
      const firstFree = allFreeModels[0];
      if (firstFree) setModel(firstFree.id);
    }
  }, [isDepleted, allFreeModels.length]);

  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [newtonResult, setNewtonResult] = useState<NewtonResult | null>(null);
  const [error, setError] = useState("");

  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const snapCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);

  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [aiImageResponse, setAiImageResponse] = useState<string | null>(null);
  const [aiImageError, setAiImageError] = useState<string | null>(null);

  // Assign stream to video element whenever both are ready
  useEffect(() => {
    if (cameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen, cameraStream]);

  async function openCamera() {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCameraStream(ms);
      setCameraOpen(true);
    } catch {
      cameraFileRef.current?.click();
    }
  }

  function captureHomeworkPhoto() {
    if (!videoRef.current || !snapCanvasRef.current) return;
    const v = videoRef.current;
    snapCanvasRef.current.width = v.videoWidth;
    snapCanvasRef.current.height = v.videoHeight;
    snapCanvasRef.current.getContext("2d")?.drawImage(v, 0, 0);
    const dataUrl = snapCanvasRef.current.toDataURL("image/jpeg", 0.92);
    setCapturedImageUrl(dataUrl);
    snapCanvasRef.current.toBlob(blob => {
      if (!blob) return;
      processFile(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      closeCamera();
    }, "image/jpeg", 0.92);
  }

  function closeCamera() {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setCameraOpen(false);
  }

  async function analyzeImageWithAI() {
    if (!capturedImageUrl && !file) return;
    setAiImageLoading(true);
    setAiImageResponse(null);
    setAiImageError(null);
    try {
      let imageDataUrl = capturedImageUrl;
      if (!imageDataUrl && file?.type.startsWith("image/")) {
        imageDataUrl = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = e => res(e.target?.result as string);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
      }
      if (!imageDataUrl) throw new Error("No image to analyse");
      const res = await fetch("/api/graph-ai-solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          imageDataUrl,
          prompt: question.trim()
            ? `Subject: ${subject || "General"}. Student question: ${question}`
            : `Analyse this homework image as a ${subject || "general"} tutor. Identify the question and provide a complete step-by-step solution.`,
          model: model,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI failed");
      setAiImageResponse(data.response);
    } catch (e) {
      setAiImageError((e as Error).message);
    }
    setAiImageLoading(false);
  }

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    setExtractedText("");
    setExtractError("");
    setExtracting(true);
    try {
      let text = "";
      if (f.type === "application/pdf") text = await extractPdfText(f);
      else if (f.type.startsWith("image/")) text = await ocrImage(f);
      else if (f.type.startsWith("text/") || f.name.endsWith(".txt") || f.name.endsWith(".md")) text = await readTextFile(f);
      else {
        try { text = await readTextFile(f); }
        catch { setExtractError("Could not extract text from this file type. Type your question below."); }
      }
      setExtractedText(text.slice(0, 12000));
    } catch (err) {
      setExtractError((err as Error).message || "Failed to process file");
    } finally {
      setExtracting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const removeFile = () => {
    setFile(null); setExtractedText(""); setExtractError(""); setShowPreview(false);
  };

  const handleSubmit = async () => {
    const fullText = `${question.trim()} ${extractedText}`.trim();
    if (!fullText) return;

    setSubmitting(true);
    setResponse("");
    setResources([]);
    setNewtonResult(null);
    setError("");

    // ── Newton math routing ──────────────────────────────────────────────────
    const textToCheck = question.trim() || extractedText;
    if (isMathQuestion(textToCheck)) {
      const parsed = extractForNewton(textToCheck);
      if (parsed) {
        try {
          const params = new URLSearchParams({
            source: "newton",
            operation: parsed.operation,
            expression: parsed.expression,
          });
          const nr = await fetch(`/api/external-solve?${params}`, { credentials: "include" });
          if (nr.ok) {
            const nd = await nr.json() as { operation: string; expression: string; result: string };
            setNewtonResult({ expression: nd.expression, operation: nd.operation, result: nd.result });
          }
        } catch {
          // Newton failure is non-fatal — AI response will still be shown
        }
      }
    }

    // ── AI homework endpoint ─────────────────────────────────────────────────
    try {
      let responseText = "";
      let relevantResources: Resource[] = [];

      if (isFreeModel(model)) {
        const modeDescMap: Record<string, string> = {
          help: "Guide me step-by-step without giving the answer",
          solve: "Provide full working with all steps explained",
          review: "Review my work, check for errors and suggest improvements",
          research: "Give a deep explanation with relevant references",
        };
        const prompt = [
          subject && `Subject: ${subject}`,
          `Mode: ${modeDescMap[mode] ?? mode}`,
          extractedText && `Homework content:\n${extractedText.slice(0, 2000)}`,
          question.trim() && `Question: ${question.trim()}`,
        ].filter(Boolean).join("\n\n");

        const res = await fetch(api("/discuss"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, ai: model }),
        });
        if (!res.ok) throw new Error("Free AI request failed");
        const data = await res.json() as { response?: string; reply?: string };
        responseText = data.response ?? data.reply ?? "";
      } else {
        const res = await fetch("/api/homework", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: extractedText || undefined,
            question: question.trim() || undefined,
            mode,
            ai: model,
            subject: subject || undefined,
          }),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error || "Request failed");
        }
        const data = await res.json() as { response: string; relevantResources: Resource[] };
        responseText = data.response;
        relevantResources = data.relevantResources ?? [];
      }

      setResponse(responseText);
      setResources(relevantResources);
      const xpMap: Record<string, number> = { help: 15, solve: 20, review: 15, research: 15 };
      logActivity("homework", `Homework ${mode}: ${(question || "uploaded file").slice(0, 80)}`, xpMap[mode] ?? 15);
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const currentMode = MODES.find(m => m.id === mode);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 max-w-5xl mx-auto"
    >
      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6"
        style={{ background: "linear-gradient(135deg, rgba(244,114,182,0.12) 0%, rgba(139,92,246,0.10) 50%, rgba(99,102,241,0.08) 100%)", border: "1px solid rgba(244,114,182,0.25)" }}>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #f472b6 0%, transparent 50%)" }} />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-2xl shrink-0" style={{ background: "rgba(244,114,182,0.2)", border: "1px solid rgba(244,114,182,0.35)" }}>
            <FileText className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-display font-black text-white">Homework Help</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload your homework · AI solves &amp; explains · Newton Mathematics Hub for maths · 400+ textbook search
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ── Left: Config ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Camera capture */}
          <AnimatePresence>
            {cameraOpen ? (
              <motion.div key="hw-cam" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="rounded-2xl overflow-hidden relative" style={{ border: "1px solid rgba(244,114,182,0.4)" }}>
                <video ref={videoRef} autoPlay playsInline muted
                  className="w-full max-h-72 object-cover bg-black" />
                <canvas ref={snapCanvasRef} className="hidden" />
                <div className="flex gap-3 p-4 bg-black/80">
                  <button onClick={captureHomeworkPhoto}
                    className="flex-1 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                    style={{ background: "rgba(244,114,182,0.4)", border: "1px solid rgba(244,114,182,0.5)" }}>
                    <Camera className="w-4 h-4" /> Capture Photo
                  </button>
                  <button onClick={closeCamera}
                    className="px-4 py-2.5 rounded-xl font-semibold text-muted-foreground hover:text-white transition-all"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="hw-cam-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex gap-2 items-center flex-wrap">
                <button onClick={openCamera}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-rose-300 transition-all hover:scale-[1.01]"
                  style={{ background: "rgba(244,114,182,0.12)", border: "1px solid rgba(244,114,182,0.28)" }}>
                  <Video className="w-4 h-4" /> {file ? "Retake with Camera" : "Use Camera"}
                </button>
                <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) { const f = e.target.files[0]; setCapturedImageUrl(null); processFile(f); } }} />
                {!file && <span className="text-xs text-muted-foreground">or drop below</span>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI direct image analysis button */}
          {(capturedImageUrl || (file && file.type.startsWith("image/"))) && !cameraOpen && (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.3)" }}>
              <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(139,92,246,0.1)" }}>
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-violet-300">Vision AI — Sees graphs, charts & math</span>
                <span className="ml-auto text-[10px] text-muted-foreground">Gemini Flash</span>
              </div>
              <div className="p-3 space-y-2">
                <button onClick={analyzeImageWithAI} disabled={aiImageLoading}
                  className="w-full py-2 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(109,40,217,0.35))", border: "1px solid rgba(139,92,246,0.5)" }}>
                  {aiImageLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Analysing image…</> : <><Wand2 className="w-4 h-4" />Analyse Image with AI</>}
                </button>
                {aiImageError && <p className="text-xs text-red-400">{aiImageError}</p>}
              </div>
              {aiImageResponse && (
                <div className="mx-3 mb-3 p-3 rounded-xl text-xs text-slate-200 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(139,92,246,0.15)" }}>
                  <p className="text-[10px] font-bold text-violet-400 mb-1.5">AI Analysis Result:</p>
                  {aiImageResponse}
                </div>
              )}
            </div>
          )}

          {/* Upload */}
          {!file && !cameraOpen ? (
            <div
              className={cn(
                "rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200",
                dragging
                  ? "border-rose-400/60 bg-rose-500/8"
                  : "border-white/10 bg-white/2 hover:border-rose-400/30 hover:bg-rose-500/4",
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(244,114,182,0.12)", border: "1px solid rgba(244,114,182,0.2)" }}>
                <Upload className="w-5 h-5 text-rose-400" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">Drop your homework here</p>
              <p className="text-xs text-muted-foreground">PDF, images (JPG/PNG), text files</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">or tap to browse</p>
              <input ref={inputRef} type="file" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.md,.doc,.docx" onChange={onFileChange} />
            </div>
          ) : file ? (
            <div className="rounded-2xl border border-white/10 p-4" style={{ background: "rgba(244,114,182,0.05)" }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(244,114,182,0.15)", border: "1px solid rgba(244,114,182,0.25)" }}>
                  <FileText className="w-4 h-4 text-rose-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{file?.name ?? ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {file ? (file.size / 1024).toFixed(0) : 0} KB
                    {extracting && <span className="ml-2 text-rose-400">Extracting…</span>}
                    {!extracting && extractedText && <span className="ml-2 text-emerald-400">✓ Text extracted</span>}
                    {!extracting && extractError && <span className="ml-2 text-amber-400">Manual input needed</span>}
                  </p>
                </div>
                <button onClick={removeFile} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {extracting && <div className="mt-3 flex items-center gap-2 text-xs text-rose-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Reading file…</div>}
              {extractError && <p className="mt-2 text-xs text-amber-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{extractError}</p>}
              {extractedText && !extracting && (
                <>
                  <button onClick={() => setShowPreview(v => !v)} className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors">
                    {showPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {showPreview ? "Hide" : "Show"} extracted text ({extractedText.length.toLocaleString()} chars)
                  </button>
                  {showPreview && (
                    <div className="mt-2 p-3 rounded-xl bg-black/20 border border-white/8 max-h-36 overflow-y-auto">
                      <p className="text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">{extractedText.slice(0, 600)}{extractedText.length > 600 ? "…" : ""}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {/* Mode */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">What kind of help?</label>
            <div className="grid grid-cols-1 gap-1.5">
              {MODES.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border text-sm transition-all duration-150",
                    mode === m.id
                      ? "text-white"
                      : "border-white/8 text-muted-foreground hover:text-white hover:border-white/15",
                  )}
                  style={mode === m.id ? { background: "rgba(244,114,182,0.12)", border: "1px solid rgba(244,114,182,0.3)" } : { background: "rgba(255,255,255,0.02)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{m.emoji}</span>
                    <span className="font-semibold text-[13px]">{m.label}</span>
                  </div>
                  <p className="text-[11px] opacity-60 mt-0.5 ml-6">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Subject (optional)</label>
            <select value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {SUBJECTS.map(s => <option key={s} value={s} className="bg-[#0d0f1e]">{s || "Select subject…"}</option>)}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              AI Model {isFreeModel(model) && <span className="text-emerald-400 normal-case ml-1">· Free</span>}
            </label>
            {isDepleted && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 px-2 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <Cpu className="w-3 h-3" /> Tokens depleted — free models only
              </div>
            )}
            <div className="space-y-1.5">
              {!isDepleted && <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-1">⚡ Premium (10K tokens)</p>}
              {!isDepleted && visiblePremiumModels.map(m => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all duration-150",
                    model === m.id ? "text-white" : "border-white/8 text-muted-foreground hover:text-white hover:border-white/15"
                  )}
                  style={model === m.id
                    ? { background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)" }
                    : { background: "rgba(255,255,255,0.02)" }
                  }
                >
                  <div className={cn("w-2 h-2 rounded-full shrink-0 transition-all", model === m.id ? "bg-indigo-400" : "bg-muted-foreground/30")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold">{m.label}</span>
                      {m.recommended && <span className="badge-recommended">⭐ Recommended</span>}
                    </div>
                    <p className="text-[11px] opacity-55">{m.sub}</p>
                  </div>
                  {model === m.id && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                </button>
              ))}
              {allFreeModels.length > 0 && (
                <>
                  <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider px-1 pt-1">✅ Free Models</p>
                  {allFreeModels.map(m => (
                    <button key={m.id} onClick={() => setModel(m.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all duration-150",
                        model === m.id ? "text-white" : "border-white/8 text-muted-foreground hover:text-white hover:border-white/15"
                      )}
                      style={model === m.id
                        ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)" }
                        : { background: "rgba(255,255,255,0.02)" }
                      }
                    >
                      <Cpu className={cn("w-3.5 h-3.5 shrink-0", model === m.id ? "text-emerald-400" : "text-muted-foreground/40")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold">{m.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "rgba(16,185,129,0.15)", color: "#6ee7b7" }}>Free</span>
                        </div>
                        <p className="text-[11px] opacity-55">{m.sub}</p>
                      </div>
                      {model === m.id && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Question + Results ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Question input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              {file ? "Additional instructions or specific question" : "Type or paste your homework question"}
            </label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder={
                file
                  ? "e.g. I need help with question 3b, or please review my attempt at question 1…"
                  : "e.g. Solve 2x² + 5x - 3 = 0 · Explain photosynthesis · Differentiate x³ + 2x…"
              }
              rows={5}
              className="w-full resize-none rounded-2xl px-4 py-3 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-rose-500/25 transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
            />

            {/* Math detection hint */}
            {isMathQuestion(question) && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <FlaskConical className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-[11px] text-emerald-400 font-medium">Maths detected — will also compute via Newton Mathematics Hub</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || extracting || (!extractedText && !question.trim())}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #db2777, #7c3aed)", boxShadow: "0 4px 20px rgba(219,39,119,0.3)" }}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Getting AI Help…</>
            ) : (
              <><Sparkles className="w-4 h-4" />{isMathQuestion(question) ? "Get AI Help + Newton Compute" : "Get AI Help"}</>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-2xl border border-red-500/20 p-4 flex items-start gap-3" style={{ background: "rgba(239,68,68,0.06)" }}>
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {(newtonResult || response) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

                {/* Newton Result */}
                {newtonResult && (
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(52,211,153,0.25)" }}>
                    {/* Header */}
                    <div className="px-4 py-3 flex items-center gap-2" style={{ background: "rgba(16,185,129,0.12)", borderBottom: "1px solid rgba(52,211,153,0.2)" }}>
                      <Hash className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-bold text-emerald-400">Newton Mathematics Hub — Computation Result</span>
                    </div>
                    {/* Body */}
                    <div className="p-4 space-y-3" style={{ background: "rgba(16,185,129,0.04)" }}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Operation</p>
                          <p className="text-sm font-semibold text-white capitalize">{newtonResult.operation}</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Expression</p>
                          <p className="text-sm font-mono text-cyan-300 break-all">{newtonResult.expression}</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)" }}>
                          <p className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest mb-1">Answer</p>
                          <p className="text-sm font-bold text-emerald-300 font-mono break-all">{newtonResult.result}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
                        <Star className="w-3 h-3 text-yellow-400/60" />
                        Computed by Newton Mathematics API (newton.now.sh) — symbolic &amp; algebraic engine
                      </p>
                    </div>
                  </div>
                )}

                {/* AI Explanation */}
                {response && (
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.25)" }}>
                    <div className="px-4 py-3 flex items-center gap-2" style={{ background: "rgba(139,92,246,0.12)", borderBottom: "1px solid rgba(139,92,246,0.2)" }}>
                      <Bot className="w-4 h-4 text-violet-400" />
                      <span className="text-sm font-bold text-violet-400">AI Explanation &amp; Guidance</span>
                      <span className="ml-auto text-[10px] text-muted-foreground/60 uppercase tracking-wider">{currentMode?.label}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-1" />
                    </div>
                    <div className="p-4" style={{ background: "rgba(139,92,246,0.04)" }}>
                      <div className="space-y-2">
                        {response.split("\n").map((line, i) =>
                          line.trim() ? (
                            <p key={i} className="text-[13px] text-slate-200 leading-relaxed">{line}</p>
                          ) : (
                            <div key={i} className="h-1" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Library resources */}
                {resources.length > 0 && (
                  <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.25)" }}>
                    <div className="px-4 py-3 flex items-center gap-2" style={{ background: "rgba(99,102,241,0.10)", borderBottom: "1px solid rgba(99,102,241,0.2)" }}>
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm font-bold text-indigo-400">Related Library Resources</span>
                      <span className="ml-auto text-[11px] font-semibold text-indigo-400/70">{resources.length} found</span>
                    </div>
                    <div className="p-4" style={{ background: "rgba(99,102,241,0.03)" }}>
                      <ul className="space-y-2">
                        {resources.map((r, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-indigo-400/60 text-xs shrink-0 mt-0.5 font-mono">{String(i + 1).padStart(2, "0")}</span>
                            <div>
                              <p className="text-[13px] font-semibold text-white leading-tight">{r.title}</p>
                              <p className="text-[11px] text-muted-foreground">{r.subject} · {r.category}{r.year ? ` · ${r.year}` : ""}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-muted-foreground/50 mt-3 pt-3 border-t border-white/5">
                        Find these in the Study Library tab to read them in full.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {!response && !newtonResult && !submitting && !error && (
            <div className="rounded-2xl border border-white/6 p-8 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(244,114,182,0.1)", border: "1px solid rgba(244,114,182,0.2)" }}>
                <Sparkles className="w-6 h-6 text-rose-400/60" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">Ready to help with your homework</p>
              <p className="text-xs text-muted-foreground mb-3">Upload a file or type your question, then click <strong className="text-white">Get AI Help</strong></p>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground/60">
                <span className="px-2 py-1 rounded-lg bg-white/5">🔢 Math → Newton Hub</span>
                <span className="px-2 py-1 rounded-lg bg-white/5">🤖 AI Explanation</span>
                <span className="px-2 py-1 rounded-lg bg-white/5">📚 400+ Resources</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
