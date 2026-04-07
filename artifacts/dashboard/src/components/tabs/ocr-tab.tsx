import React, { useState, useCallback, useRef } from "react";
import {
  Camera, UploadCloud, ArrowRight, Image as ImageIcon,
  Calculator, Sparkles, X, Loader2, AlertCircle, CheckCircle2,
  FlaskConical, Video,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useUploadOCR } from "@/hooks/use-math-api";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(path: string) { return `${BASE_URL}api${path}`; }

function logActivity(type: string, description: string, xpEarned: number) {
  fetch(api("/activity"), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, description, xpEarned }),
  }).catch(() => {});
}

interface OcrTabProps {
  onSendToSolver: (text: string) => void;
}

function isMathQuestion(text: string): boolean {
  if (!text || text.length < 3) return false;
  const numberedItemCount = (text.match(/\b\d+[)\.]\s/g) || []).length;
  if (numberedItemCount >= 2) return false;
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const exprLines = lines.filter(l => /[0-9x]\s*[\+\-\*\/\^=]/.test(l));
  if (exprLines.length >= 3) return false;
  if (text.trim().length > 180) return false;
  const patterns = [
    /[0-9]+\s*[\+\-\*\/\^=]\s*[0-9x]/,
    /[a-zA-Z]\s*[\+\-\*\^]\s*[0-9]/,
    /\b(solve|simplify|factor|derive|derivative|integrate|differentiate|expand)\b/i,
    /\d+x|\bx\^|\bx²|\bx³|sin\(|cos\(|tan\(|log\(|ln\(|sqrt\(/i,
    /[\+\-]?\d+\/\d+/,
  ];
  return patterns.some(p => p.test(text));
}

function extractForNewton(text: string): { expression: string; operation: string } | null {
  let operation = "simplify";
  if (/\b(derive|derivative|differentiate|d\/dx)\b/i.test(text)) operation = "derive";
  else if (/\b(factor|factorise|factorize)\b/i.test(text)) operation = "factor";
  else if (/\b(integrate|integral)\b/i.test(text)) operation = "integrate";
  else if (/\b(expand)\b/i.test(text)) operation = "expand";

  let expr = text
    .replace(/\b(solve|find|calculate|compute|what is|evaluate|simplify|factor|derive|integrate|expand|the|of|given|that|if|let|for|when|where|please|help|me|with|this|question|problem)\b/gi, " ")
    .replace(/[,;:.!?]/g, " ").replace(/\s+/g, " ").trim();

  const mathBlocks = expr.match(/[0-9a-zA-Z\+\-\*\/\^\(\)=\.x\s]{3,}/g) || [];
  if (!mathBlocks.length) return null;
  const best = mathBlocks.map(b => b.trim())
    .filter(b => b.length >= 2 && /[0-9x]/.test(b) && /[\+\-\*\/\^=]/.test(b))
    .sort((a, b) => b.length - a.length)[0];
  if (!best) return null;
  const cleaned = best.replace(/\s+/g, " ").trim();
  if (cleaned.length > 120) return null;
  return { expression: cleaned, operation };
}

const NEWTON_OPS = ["simplify", "factor", "derive", "integrate", "zeroes", "tangent", "area", "cos", "sin", "arcsin"];

export default function OcrTab({ onSendToSolver }: OcrTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [newtonPopup, setNewtonPopup] = useState(false);
  const [newtonOp, setNewtonOp] = useState("simplify");
  const [newtonResult, setNewtonResult] = useState<{ result: string; operation: string } | null>(null);
  const [newtonLoading, setNewtonLoading] = useState(false);
  const [newtonError, setNewtonError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: extractText, isPending } = useUploadOCR();

  const processFile = useCallback((f: File) => {
    setFile(f);
    setOcrText("");
    setNewtonPopup(false);
    setNewtonResult(null);
    setAiResult(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) processFile(acceptedFiles[0]);
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }, maxFiles: 1,
  });

  const handleExtract = () => {
    if (!file) return;
    setNewtonPopup(false); setNewtonResult(null); setAiResult(null);
    extractText(file, {
      onSuccess: (data) => {
        setOcrText(data.text);
        if (isMathQuestion(data.text)) {
          const parsed = extractForNewton(data.text);
          if (parsed) setNewtonOp(parsed.operation);
          setNewtonPopup(true);
        }
      },
      onError: (err) => setOcrText(`Error: ${err.message}`),
    });
  };

  async function openCamera() {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStream(ms); setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = ms; }, 100);
    } catch {
      fileInputRef.current?.click();
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    canvasRef.current.width = v.videoWidth;
    canvasRef.current.height = v.videoHeight;
    canvasRef.current.getContext("2d")?.drawImage(v, 0, 0);
    canvasRef.current.toBlob(blob => {
      if (!blob) return;
      const f = new File([blob], "camera.jpg", { type: "image/jpeg" });
      processFile(f);
      closeCamera();
    }, "image/jpeg", 0.92);
  }

  function closeCamera() {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null); setCameraOpen(false);
  }

  async function computeNewton() {
    const parsed = extractForNewton(ocrText);
    if (!parsed) { setNewtonError("Could not extract a clean expression."); return; }
    setNewtonLoading(true); setNewtonError(null); setNewtonResult(null);
    try {
      const url = `https://newton.vercel.app/api/v2/${newtonOp}/${encodeURIComponent(parsed.expression)}`;
      const res = await fetch(url);
      const data = await res.json();
      setNewtonResult({ result: data.result, operation: newtonOp });
    } catch { setNewtonError("Newton API failed. Try a different operation."); }
    setNewtonLoading(false);
  }

  async function askQwen() {
    if (!ocrText.trim()) return;
    setAiLoading(true); setAiError(null); setAiResult(null);
    try {
      const res = await fetch(api("/discuss"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ prompt: `Solve or explain this question clearly:\n\n${ocrText}`, ai: "qwen/qwen3.5-122b-a10b" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI failed");
      setAiResult(data.response);
      logActivity("ocr_ai", `OCR AI analysis: ${ocrText.slice(0, 80)}`, 10);
    } catch (e) { setAiError((e as Error).message); }
    setAiLoading(false);
  }

  const isMath = ocrText ? isMathQuestion(ocrText) : false;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, rgba(217,70,239,0.12) 0%, rgba(168,85,247,0.08) 100%)", border: "1px solid rgba(217,70,239,0.25)" }}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl shrink-0" style={{ background: "rgba(217,70,239,0.2)", border: "1px solid rgba(217,70,239,0.35)" }}>
            <Camera className="w-6 h-6 text-fuchsia-400" />
          </div>
          <div>
            <h2 className="text-xl font-display font-black text-white">Image OCR</h2>
            <p className="text-sm text-muted-foreground">Scan a question — extract text, compute with Newton or ask AI</p>
          </div>
        </div>
      </div>

      {/* Camera / Upload */}
      <AnimatePresence>
        {cameraOpen ? (
          <motion.div key="camera" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl overflow-hidden relative" style={{ border: "1px solid rgba(217,70,239,0.3)" }}>
            <video ref={videoRef} autoPlay playsInline className="w-full max-h-72 object-cover bg-black" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-3 p-4 bg-black/80">
              <button onClick={capturePhoto}
                className="flex-1 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                style={{ background: "rgba(217,70,239,0.4)", border: "1px solid rgba(217,70,239,0.5)" }}>
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
          <motion.div key="upload" className="space-y-3">
            <div className="flex gap-3">
              <button onClick={openCamera}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-fuchsia-300 transition-all hover:scale-[1.02]"
                style={{ background: "rgba(217,70,239,0.15)", border: "1px solid rgba(217,70,239,0.35)" }}>
                <Video className="w-4 h-4" /> Use Camera
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} />
              <p className="flex items-center text-xs text-muted-foreground">or drop an image below</p>
            </div>
            <div {...getRootProps()}
              className={cn("border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
                isDragActive ? "border-fuchsia-500 bg-fuchsia-500/10" : "border-white/15 hover:border-fuchsia-500/50 hover:bg-white/5"
              )}>
              <input {...getInputProps()} />
              <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Click to upload or drag an image here</p>
              <p className="text-xs text-muted-foreground">PNG, JPG, JPEG, WEBP</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview */}
      {preview && !cameraOpen && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Selected image</span>
          </div>
          <img src={preview} alt="Preview" className="max-h-64 w-full object-contain bg-black/30 p-2" />
        </div>
      )}

      {/* Extract button */}
      {file && !cameraOpen && (
        <button onClick={handleExtract} disabled={isPending}
          className="w-full py-2.5 rounded-xl font-bold text-white transition-all hover:scale-[1.01] disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "rgba(217,70,239,0.3)", border: "1px solid rgba(217,70,239,0.45)" }}>
          {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Extracting text…</> : <><Camera className="w-4 h-4" />Extract Text</>}
        </button>
      )}

      {/* OCR Result */}
      <AnimatePresence>
        {ocrText && (
          <motion.div key="ocr" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
                <span className="text-xs font-semibold text-white">Extracted Text</span>
                {isMath
                  ? <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold"><CheckCircle2 className="w-3 h-3" />Math detected</span>
                  : <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><AlertCircle className="w-3 h-3" />Text / unclear math</span>
                }
              </div>
              <div className="p-4 font-mono text-sm leading-relaxed text-slate-300 max-h-40 overflow-y-auto" style={{ background: "rgba(0,0,0,0.3)" }}>
                {ocrText.split(/\s+/).map((word, i) => (
                  <mark key={i} className="bg-yellow-500/20 text-yellow-200 px-1 rounded mr-1">{word}</mark>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onSendToSolver(ocrText)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.01]"
                style={{ background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.45)" }}>
                <ArrowRight className="w-4 h-4" /> Send to AI Solver
              </button>
              {isMath && (
                <button onClick={() => setNewtonPopup(p => !p)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-emerald-300 transition-all hover:scale-[1.01]"
                  style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)" }}>
                  <Calculator className="w-4 h-4" /> Compute via Newton
                </button>
              )}
              <button onClick={askQwen} disabled={aiLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-violet-300 transition-all hover:scale-[1.01] disabled:opacity-50"
                style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isMath ? "Ask Qwen 122B" : "Explain with Qwen 122B"}
              </button>
            </div>

            {/* Newton Popup */}
            <AnimatePresence>
              {newtonPopup && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(16,185,129,0.3)" }}>
                  <div className="p-4 space-y-3" style={{ background: "rgba(16,185,129,0.06)" }}>
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-300">Newton API Calculator</span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Operation</p>
                      <div className="flex flex-wrap gap-1.5">
                        {NEWTON_OPS.map(op => (
                          <button key={op} onClick={() => setNewtonOp(op)}
                            className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all border",
                              newtonOp === op ? "text-emerald-300 border-emerald-500/50 bg-emerald-500/15" : "text-muted-foreground border-white/10 hover:border-white/20"
                            )}>
                            {op}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={computeNewton} disabled={newtonLoading}
                      className="w-full py-2 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50"
                      style={{ background: "rgba(16,185,129,0.25)", border: "1px solid rgba(16,185,129,0.4)" }}>
                      {newtonLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Computing…</> : <><FlaskConical className="w-4 h-4" />Compute</>}
                    </button>
                    {newtonError && <p className="text-red-400 text-xs">{newtonError}</p>}
                    {newtonResult && (
                      <div className="p-3 rounded-xl font-mono text-sm text-emerald-300" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(16,185,129,0.2)" }}>
                        <span className="text-muted-foreground text-xs capitalize">{newtonResult.operation}:</span>
                        <br />{newtonResult.result}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Qwen AI result */}
            <AnimatePresence>
              {(aiLoading || aiResult || aiError) && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.25)" }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-500/20" style={{ background: "rgba(139,92,246,0.08)" }}>
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-xs font-semibold text-violet-300">Qwen 3.5 122B Response</span>
                  </div>
                  <div className="p-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap" style={{ background: "rgba(0,0,0,0.3)" }}>
                    {aiLoading ? <span className="flex items-center gap-2 text-violet-300"><Loader2 className="w-4 h-4 animate-spin" />Qwen 122B is thinking…</span>
                      : aiError ? <span className="text-red-400">{aiError}</span>
                      : aiResult}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
