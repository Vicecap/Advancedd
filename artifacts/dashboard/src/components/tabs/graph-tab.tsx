import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  LineChart as LineChartIcon, BarChart2, ScatterChart as ScatterIcon,
  Pencil, Eraser, Minus, Triangle, Circle, Square, Sparkles, Loader2,
  RotateCcw, Download, ChevronDown, AlertCircle, Wand2, PenLine,
  Settings2, Type, Camera, X as XIcon, ScanLine,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { evaluate } from "mathjs";
import {
  LineChart as RechartsLineChart, Line,
  BarChart as RechartsBarChart, Bar,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(path: string) { return `${BASE_URL}api${path}`; }

interface GraphTabProps {
  initialFunction?: string;
  hideHeader?: boolean;
}

type DrawTool = "pencil" | "pen" | "eraser" | "ruler" | "protractor" | "setsquare" | "text";
type MathSet = "ruler" | "protractor" | "setsquare" | "compass";
type AIModel = "google/gemini-2.0-flash-001" | "google/gemini-flash-1.5-8b" | "meta-llama/llama-3.2-11b-vision-instruct" | "openai/gpt-4o-mini" | "free/qwen2.5:7b" | "free/llama3.2:3b";
const FREE_GRAPH_MODELS: AIModel[] = ["free/qwen2.5:7b", "free/llama3.2:3b"];
function isFreeGraphModel(m: AIModel) { return FREE_GRAPH_MODELS.includes(m); }

interface Stroke {
  points: [number, number][];
  tool: "pencil" | "pen" | "eraser";
  color: string;
  width: number;
}

interface MathGadget {
  id: string;
  type: MathSet;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

const STROKE_COLORS = ["#ffffff", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb923c"];

function DrawingCanvas({ onCanvasRef }: { onCanvasRef: (c: HTMLCanvasElement | null) => void }) {
  return null;
}

export default function GraphTab({ initialFunction = "", hideHeader = false }: GraphTabProps) {
  const [mode, setMode] = useState<"plotter" | "draw">("plotter");

  // ── Plotter state ──
  const [expression, setExpression] = useState(initialFunction);
  const [plotType, setPlotType] = useState("line");
  const [data, setData] = useState<{ x: number; y: number }[]>([]);
  const [plotError, setPlotError] = useState<string | null>(null);

  // ── Drawing state ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [gadgets, setGadgets] = useState<MathGadget[]>([]);
  const [draggingGadget, setDraggingGadget] = useState<string | null>(null);
  const [gadgetDragOffset, setGadgetDragOffset] = useState({ x: 0, y: 0 });

  // ── Text tool state ──
  const [textInput, setTextInput] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [fontSize, setFontSize] = useState(20);

  // ── Camera scan state ──
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [canvasBackground, setCanvasBackground] = useState<HTMLImageElement | null>(null);

  // ── AI solve state ──
  const [aiModel, setAiModel] = useState<AIModel>("google/gemini-2.0-flash-001");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const plotTypes = [
    { value: "line", label: "Line Graph", icon: LineChartIcon },
    { value: "bar", label: "Bar Chart", icon: BarChart2 },
    { value: "scatter", label: "Scatter Plot", icon: ScatterIcon },
  ];

  const handleDraw = () => {
    if (!expression.trim()) return;
    setPlotError(null);
    const pts: { x: number; y: number }[] = [];
    try {
      if (/^[\d\s,.-]+$/.test(expression.trim())) {
        expression.split(',').map(n => Number(n.trim())).forEach((n, i) => pts.push({ x: i + 1, y: n }));
      } else {
        const cleanExpr = expression.replace(/\*\*/g, '^');
        for (let i = -10; i <= 10; i += 0.25) {
          try {
            const val = evaluate(cleanExpr, { x: i });
            if (typeof val === 'number' && isFinite(val)) pts.push({ x: Number(i.toFixed(2)), y: Number(val.toFixed(4)) });
          } catch {}
        }
      }
      setData(pts);
    } catch { setPlotError("Failed to parse expression"); }
  };

  // ── Canvas drawing ──
  function getPos(e: React.MouseEvent | React.TouchEvent): [number, number] {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return [(t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY];
    }
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (tool === "ruler" || tool === "protractor" || tool === "setsquare") return;
    if (tool === "text") {
      e.preventDefault();
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      let clientX: number, clientY: number;
      if ("touches" in e) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
      else { clientX = (e as React.MouseEvent).clientX; clientY = (e as React.MouseEvent).clientY; }
      const canvasX = (clientX - rect.left) * scaleX;
      const canvasY = (clientY - rect.top) * scaleY;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      setTextInput({ x, y, canvasX, canvasY });
      setTextValue("");
      return;
    }
    e.preventDefault();
    const pos = getPos(e);
    setDrawing(true);
    setCurrentStroke([pos]);
  }

  function continueDraw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing || tool === "ruler" || tool === "protractor" || tool === "setsquare" || tool === "text") return;
    e.preventDefault();
    const pos = getPos(e);
    setCurrentStroke(s => [...s, pos]);
    redrawCanvas([...strokes], [...currentStroke, pos]);
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const toolType = tool === "eraser" ? "eraser" : tool === "pencil" ? "pencil" : "pen";
    const w = tool === "pencil" ? Math.max(1, strokeWidth - 1) : tool === "eraser" ? 20 : strokeWidth;
    const newStroke: Stroke = { points: currentStroke, tool: toolType as any, color, width: w };
    const newStrokes = [...strokes, newStroke];
    setStrokes(newStrokes);
    setCurrentStroke([]);
    setDrawing(false);
    redrawCanvas(newStrokes, []);
  }

  function commitText() {
    if (!textInput || !textValue.trim()) { setTextInput(null); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.fillText(textValue.trim(), textInput.canvasX, textInput.canvasY);
    setTextInput(null);
    setTextValue("");
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "t" || e.key === "T") {
        const active = document.activeElement as HTMLElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        setTool("text");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function redrawCanvas(allStrokes: Stroke[], current: [number, number][], bg?: HTMLImageElement | null) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bgImage = bg !== undefined ? bg : canvasBackground;
    if (bgImage) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    for (const stroke of allStrokes) {
      if (!stroke.points.length) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.tool === "eraser" ? "#1a1a2e" : stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (stroke.tool === "pencil") {
        ctx.globalAlpha = 0.7;
        ctx.setLineDash([2, 2]);
      } else {
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      ctx.moveTo(...stroke.points[0]);
      for (let i = 1; i < stroke.points.length; i++) {
        const [mx, my] = [(stroke.points[i - 1][0] + stroke.points[i][0]) / 2, (stroke.points[i - 1][1] + stroke.points[i][1]) / 2];
        ctx.quadraticCurveTo(...stroke.points[i - 1], mx, my);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    if (current.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "eraser" ? "#1a1a2e" : color;
      ctx.lineWidth = tool === "pencil" ? Math.max(1, strokeWidth - 1) : tool === "eraser" ? 20 : strokeWidth;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (tool === "pencil") { ctx.globalAlpha = 0.7; ctx.setLineDash([2, 2]); }
      ctx.moveTo(...current[0]);
      for (let i = 1; i < current.length; i++) ctx.lineTo(...current[i]);
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]); setCurrentStroke([]); setGadgets([]);
    setCanvasBackground(null);
    setAiResult(null); setAiError(null);
  }

  function undoStroke() {
    const newStrokes = strokes.slice(0, -1);
    setStrokes(newStrokes);
    setTimeout(() => redrawCanvas(newStrokes, []), 0);
  }

  async function openCamera() {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setCameraStream(ms);
      setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = ms; }, 100);
    } catch {
      alert("Could not access camera. Please allow camera permissions.");
    }
  }

  function closeCamera() {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setCameraOpen(false);
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = 900; tmpCanvas.height = 560;
    const ctx = tmpCanvas.getContext("2d")!;
    const vr = video.videoWidth / video.videoHeight;
    const cr = 900 / 560;
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
    if (vr > cr) { sw = Math.round(sh * cr); sx = Math.round((video.videoWidth - sw) / 2); }
    else { sh = Math.round(sw / cr); sy = Math.round((video.videoHeight - sh) / 2); }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 900, 560);
    const img = new Image();
    img.onload = () => {
      setCanvasBackground(img);
      setStrokes([]);
      setCurrentStroke([]);
      redrawCanvas([], [], img);
      if (mode !== "draw") setMode("draw");
      closeCamera();
    };
    img.src = tmpCanvas.toDataURL("image/jpeg", 0.92);
  }

  function loadImageFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setCanvasBackground(img);
        setStrokes([]);
        redrawCanvas([], [], img);
        if (mode !== "draw") setMode("draw");
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  }

  function downloadCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a"); link.download = "drawing.png";
    link.href = canvas.toDataURL(); link.click();
  }

  function addGadget(type: MathSet) {
    const id = `${type}-${Date.now()}`;
    setGadgets(g => [...g, { id, type, x: 80, y: 80, rotation: 0, scale: 1 }]);
  }

  function removeGadget(id: string) {
    setGadgets(g => g.filter(x => x.id !== id));
  }

  async function solveWithAI() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setAiLoading(true); setAiResult(null); setAiError(null);
    try {
      if (isFreeGraphModel(aiModel)) {
        const realModel = (aiModel as string).replace("free/", "");
        const prompt = aiPrompt.trim()
          ? aiPrompt
          : "Explain how to solve the mathematical problem described. Provide a step-by-step solution for an O-Level student.";
        const res = await fetch(api("/discuss"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: prompt }], model: realModel }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "AI failed");
        setAiResult(data.content ?? data.response ?? "No response");
      } else {
        const dataURL = canvas.toDataURL("image/jpeg", 0.85);
        const res = await fetch(api("/graph-ai-solve"), {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ imageDataUrl: dataURL, prompt: aiPrompt, model: aiModel }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "AI failed");
        setAiResult(data.response);
      }
    } catch (e) { setAiError((e as Error).message); }
    setAiLoading(false);
  }

  const DRAW_TOOLS: { id: DrawTool; icon: React.ElementType; label: string; shortcut?: string }[] = [
    { id: "pencil", icon: Pencil, label: "Pencil" },
    { id: "pen", icon: PenLine, label: "Pen" },
    { id: "eraser", icon: Eraser, label: "Eraser" },
    { id: "text", icon: Type, label: "Text", shortcut: "T" },
  ];

  const MATH_GADGETS: { id: MathSet; icon: React.ElementType; label: string }[] = [
    { id: "ruler", icon: Minus, label: "Ruler" },
    { id: "protractor", icon: Circle, label: "Protractor" },
    { id: "setsquare", icon: Triangle, label: "Set Square" },
    { id: "compass", icon: Settings2, label: "Compass" },
  ];

  const ChartComponent = useMemo(() => {
    switch (plotType) {
      case "bar": return RechartsBarChart;
      case "scatter": return ScatterChart;
      default: return RechartsLineChart;
    }
  }, [plotType]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      {!hideHeader && (
        <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(16,185,129,0.08) 100%)", border: "1px solid rgba(52,211,153,0.25)" }}>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl" style={{ background: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.35)" }}>
              <LineChartIcon className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-white">Graph & Drawing</h2>
              <p className="text-sm text-muted-foreground">Plot functions or draw freehand — solve with AI</p>
            </div>
          </div>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2">
        {[
          { id: "plotter" as const, icon: LineChartIcon, label: "Graph Plotter" },
          { id: "draw" as const, icon: Pencil, label: "Drawing Canvas" },
        ].map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setMode(id)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border",
              mode === id ? "text-white border-emerald-500/60" : "text-muted-foreground border-white/10 hover:border-white/20"
            )}
            style={mode === id ? { background: "rgba(52,211,153,0.2)" } : { background: "rgba(255,255,255,0.03)" }}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Graph Plotter ── */}
        {mode === "plotter" && (
          <motion.div key="plotter" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className="space-y-4 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Function or Data</p>
                <textarea
                  placeholder="e.g. x^2 + 2*x  OR  1, 4, 9, 16, 25"
                  value={expression}
                  onChange={e => setExpression(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleDraw(); } }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white font-mono focus:outline-none min-h-[80px] resize-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Plot Type</p>
                {plotTypes.map(({ value, label, icon: Icon }) => (
                  <button key={value} onClick={() => setPlotType(value)}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border",
                      plotType === value ? "text-emerald-300 border-emerald-500/50" : "text-muted-foreground border-white/10 hover:border-white/20"
                    )}
                    style={plotType === value ? { background: "rgba(52,211,153,0.15)" } : { background: "rgba(255,255,255,0.03)" }}>
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
                <button onClick={handleDraw}
                  className="w-full py-2 rounded-xl text-sm font-bold text-white mt-1 transition-all hover:scale-[1.02]"
                  style={{ background: "rgba(52,211,153,0.3)", border: "1px solid rgba(52,211,153,0.45)" }}>
                  Plot Graph
                </button>
              </div>
            </div>
            {plotError && <p className="text-red-400 text-sm">{plotError}</p>}
            <div className="w-full h-80 rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  {/* @ts-ignore */}
                  <ChartComponent data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                    <XAxis dataKey="x" stroke="#6B7280" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                    <YAxis stroke="#6B7280" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#1F2937', borderRadius: '8px' }} itemStyle={{ color: '#34d399' }} />
                    {plotType === 'line' && <Line type="monotone" dataKey="y" stroke="#34d399" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />}
                    {plotType === 'bar' && <Bar dataKey="y" fill="#34d399" radius={[4, 4, 0, 0]} />}
                    {plotType === 'scatter' && <Scatter name="Values" dataKey="y" fill="#34d399" />}
                  </ChartComponent>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <LineChartIcon className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Enter a function and click Plot</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Drawing Canvas ── */}
        {mode === "draw" && (
          <motion.div key="draw" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className="space-y-3">
            {/* Toolbar */}
            <div className="rounded-2xl p-3 flex flex-wrap gap-3 items-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {/* Draw tools */}
              <div className="flex gap-1.5">
                {DRAW_TOOLS.map(({ id, icon: Icon, label }) => (
                  <button key={id} onClick={() => setTool(id)} title={label}
                    className={cn("p-2 rounded-xl transition-all border",
                      tool === id ? "text-white border-emerald-500/60" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white"
                    )}
                    style={tool === id ? { background: "rgba(52,211,153,0.2)" } : { background: "rgba(255,255,255,0.03)" }}>
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>

              <div className="w-px h-6 bg-white/10" />

              {/* Colors */}
              <div className="flex gap-1.5">
                {STROKE_COLORS.map(c => (
                  <button key={c} onClick={() => { setColor(c); if (tool === "eraser") setTool("pen"); }}
                    className="w-5 h-5 rounded-full transition-all hover:scale-110"
                    style={{ background: c, boxShadow: color === c ? `0 0 0 2px white, 0 0 0 3px ${c}` : "none" }} />
                ))}
              </div>

              <div className="w-px h-6 bg-white/10" />

              {/* Stroke/font size */}
              {tool === "text" ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Font</span>
                  <input type="range" min="10" max="80" value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
                    className="w-16 accent-violet-400 h-1" />
                  <span className="text-xs text-muted-foreground w-6">{fontSize}px</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Size</span>
                  <input type="range" min="1" max="12" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))}
                    className="w-16 accent-emerald-400 h-1" />
                  <span className="text-xs text-muted-foreground w-4">{strokeWidth}</span>
                </div>
              )}

              <div className="w-px h-6 bg-white/10" />

              {/* Math set */}
              <div className="flex gap-1.5">
                {MATH_GADGETS.map(({ id, icon: Icon, label }) => (
                  <button key={id} onClick={() => addGadget(id)} title={`Add ${label}`}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>

              <div className="ml-auto flex gap-1.5 flex-wrap">
                {/* Camera scan button */}
                <button onClick={openCamera} title="Scan graph with camera"
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-cyan-500/30 hover:border-cyan-400/60 text-cyan-400 hover:text-cyan-300 text-xs font-semibold transition-all"
                  style={{ background: "rgba(6,182,212,0.08)" }}>
                  <Camera className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Scan</span>
                </button>
                {/* Upload image button */}
                <label title="Load image to canvas" className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadImageFile(f); e.target.value = ""; }} />
                  <span className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-indigo-500/30 hover:border-indigo-400/60 text-indigo-400 hover:text-indigo-300 text-xs font-semibold transition-all cursor-pointer"
                    style={{ background: "rgba(99,102,241,0.08)" }}>
                    <Download className="w-3.5 h-3.5 rotate-180" />
                    <span className="hidden sm:inline">Load</span>
                  </span>
                </label>
                <div className="w-px h-6 bg-white/10 self-center" />
                <button onClick={undoStroke} title="Undo"
                  className="p-2 rounded-xl border border-white/10 hover:border-white/20 text-muted-foreground hover:text-white transition-all"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button onClick={clearCanvas} title="Clear"
                  className="p-2 rounded-xl border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 transition-all"
                  style={{ background: "rgba(239,68,68,0.05)" }}>
                  <Eraser className="w-4 h-4" />
                </button>
                <button onClick={downloadCanvas} title="Download"
                  className="p-2 rounded-xl border border-white/10 hover:border-white/20 text-muted-foreground hover:text-white transition-all"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Canvas area */}
            <div className="relative rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)", background: "#0d0d1a" }}>
              <canvas
                ref={canvasRef}
                width={900}
                height={560}
                className="w-full block"
                style={{ cursor: tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair", touchAction: "none" }}
                onMouseDown={startDraw}
                onMouseMove={continueDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={continueDraw}
                onTouchEnd={endDraw}
              />

              {/* Text input overlay */}
              {textInput && (
                <div className="absolute z-30" style={{ left: textInput.x, top: textInput.y, transform: "translateY(-2px)" }}>
                  <input
                    autoFocus
                    value={textValue}
                    onChange={e => setTextValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); commitText(); }
                      if (e.key === "Escape") { setTextInput(null); setTextValue(""); }
                    }}
                    onBlur={commitText}
                    placeholder="Type text…"
                    className="outline-none bg-transparent border-b border-dashed min-w-24"
                    style={{
                      color: color,
                      fontSize: `${Math.max(11, fontSize * 0.65)}px`,
                      fontWeight: "bold",
                      fontFamily: '"Segoe UI", sans-serif',
                      borderColor: color,
                      caretColor: color,
                    }}
                  />
                </div>
              )}

              {/* Gadget overlays */}
              {gadgets.map(g => (
                <GadgetOverlay key={g.id} gadget={g}
                  onMove={(dx, dy) => setGadgets(gs => gs.map(x => x.id === g.id ? { ...x, x: x.x + dx, y: x.y + dy } : x))}
                  onRotate={dr => setGadgets(gs => gs.map(x => x.id === g.id ? { ...x, rotation: x.rotation + dr } : x))}
                  onRemove={() => removeGadget(g.id)} />
              ))}

              {strokes.length === 0 && gadgets.length === 0 && !canvasBackground && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40 pointer-events-none">
                  <Pencil className="w-12 h-12 mb-2" />
                  <p className="text-sm">Draw your question, graph, or geometry here</p>
                  <p className="text-xs mt-1 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-cyan-400/60" /> Tap <span className="text-cyan-400/60 font-semibold">Scan</span> to photograph a graph and edit it</p>
                </div>
              )}
            </div>

            {/* Camera overlay */}
            <AnimatePresence>
              {cameraOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
                >
                  <div className="w-full max-w-xl rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(6,182,212,0.4)" }}>
                    <div className="px-4 py-3 flex items-center justify-between" style={{ background: "rgba(6,182,212,0.1)" }}>
                      <div className="flex items-center gap-2">
                        <ScanLine className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-semibold text-cyan-300">Scan Graph</span>
                      </div>
                      <button onClick={closeCamera} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-all">
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="relative bg-black" style={{ aspectRatio: "16/10" }}>
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      <div className="absolute inset-0 pointer-events-none" style={{ border: "2px solid rgba(6,182,212,0.4)", borderRadius: 2 }}>
                        <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-cyan-400" />
                        <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-cyan-400" />
                        <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-cyan-400" />
                        <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-cyan-400" />
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-center gap-3" style={{ background: "rgba(0,0,0,0.6)" }}>
                      <p className="text-xs text-muted-foreground flex-1">Point camera at your graph or diagram</p>
                      <button onClick={captureFrame}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95"
                        style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.5), rgba(8,145,178,0.4))", border: "1px solid rgba(6,182,212,0.6)" }}>
                        <Camera className="w-4 h-4" /> Capture
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI Solve panel */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.25)" }}>
              <button onClick={() => setShowAiPanel(p => !p)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/5 transition-all"
                style={{ background: "rgba(139,92,246,0.08)" }}>
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-white flex-1 text-left">Solve with AI</span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showAiPanel && "rotate-180")} />
              </button>
              <AnimatePresence>
                {showAiPanel && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="p-4 space-y-3 border-t border-violet-500/20">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wider">Free Models (Text)</p>
                        <div className="flex gap-2 flex-wrap">
                          {([
                            { id: "free/qwen2.5:7b" as AIModel, label: "Qwen 2.5 7B" },
                            { id: "free/llama3.2:3b" as AIModel, label: "Llama 3.2 3B" },
                          ]).map(({ id, label }) => (
                            <button key={id} onClick={() => setAiModel(id)}
                              className={cn("flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all border",
                                aiModel === id ? "text-white border-emerald-500/60" : "text-muted-foreground border-white/10 hover:border-white/20"
                              )}
                              style={aiModel === id ? { background: "rgba(16,185,129,0.2)" } : { background: "rgba(255,255,255,0.03)" }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] font-semibold text-violet-400/80 uppercase tracking-wider mt-2">Premium Models (Vision)</p>
                        <div className="flex gap-2 flex-wrap">
                          {([
                            { id: "google/gemini-2.0-flash-001" as AIModel, label: "Gemini Flash" },
                            { id: "google/gemini-flash-1.5-8b" as AIModel, label: "Gemini Lite" },
                            { id: "meta-llama/llama-3.2-11b-vision-instruct" as AIModel, label: "Llama Vision" },
                            { id: "openai/gpt-4o-mini" as AIModel, label: "GPT-4o Mini" },
                          ]).map(({ id, label }) => (
                            <button key={id} onClick={() => setAiModel(id)}
                              className={cn("flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all border",
                                aiModel === id ? "text-white border-violet-500/60" : "text-muted-foreground border-white/10 hover:border-white/20"
                              )}
                              style={aiModel === id ? { background: "rgba(139,92,246,0.25)" } : { background: "rgba(255,255,255,0.03)" }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder="Describe what you drew, or ask a specific question… (optional)"
                        className="w-full px-3 py-2 rounded-xl text-sm text-white focus:outline-none resize-none min-h-[60px]"
                        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                      />
                      <button onClick={solveWithAI} disabled={aiLoading || (!isFreeGraphModel(aiModel) && strokes.length === 0 && !canvasBackground)}
                        className="w-full py-2.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.5), rgba(109,40,217,0.4))", border: "1px solid rgba(139,92,246,0.5)" }}>
                        {aiLoading
                          ? <><Loader2 className="w-4 h-4 animate-spin" />Analysing…</>
                          : <><Wand2 className="w-4 h-4" />{isFreeGraphModel(aiModel) ? "Ask AI (text)" : (canvasBackground && strokes.length === 0 ? "Analyse image" : "Solve drawing")}</>}
                      </button>
                      {aiError && (
                        <div className="flex items-center gap-2 text-red-400 text-xs p-2 rounded-xl border border-red-500/20" style={{ background: "rgba(239,68,68,0.08)" }}>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{aiError}
                        </div>
                      )}
                      {aiResult && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          className="rounded-xl p-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap"
                          style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(139,92,246,0.2)" }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                            <span className="text-xs font-semibold text-violet-300">{isFreeGraphModel(aiModel) ? "Free AI" : aiModel.split("/").pop()} Analysis</span>
                          </div>
                          {aiResult}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GadgetOverlay({ gadget, onMove, onRotate, onRemove }: {
  gadget: MathGadget;
  onMove: (dx: number, dy: number) => void;
  onRotate: (dr: number) => void;
  onRemove: () => void;
}) {
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!lastPos.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    onMove(dx, dy);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerUp = () => { lastPos.current = null; };

  const gadgetContent = () => {
    switch (gadget.type) {
      case "ruler":
        return (
          <div className="relative" style={{ width: 200, height: 40 }}>
            <div className="absolute inset-0 rounded border border-yellow-400/80 bg-yellow-400/10 flex items-center">
              {Array.from({ length: 21 }, (_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className={cn("bg-yellow-400/60", i % 5 === 0 ? "h-4 w-0.5" : "h-2 w-px")} />
                  {i % 5 === 0 && <span className="text-[8px] text-yellow-400/80">{i}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      case "protractor":
        return (
          <svg width={120} height={64} viewBox="0 0 120 64">
            <path d="M 5 60 A 55 55 0 0 1 115 60" fill="none" stroke="rgba(96,165,250,0.8)" strokeWidth="2" />
            <line x1="5" y1="60" x2="115" y2="60" stroke="rgba(96,165,250,0.8)" strokeWidth="1.5" />
            {Array.from({ length: 19 }, (_, i) => {
              const angle = (i * 10 * Math.PI) / 180;
              const r1 = 55, r2 = i % 3 === 0 ? 48 : 52;
              const x1 = 60 - r1 * Math.sin(angle), y1 = 60 - r1 * Math.cos(angle);
              const x2 = 60 - r2 * Math.sin(angle), y2 = 60 - r2 * Math.cos(angle);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(96,165,250,0.7)" strokeWidth="1" />;
            })}
          </svg>
        );
      case "setsquare":
        return (
          <svg width={100} height={100} viewBox="0 0 100 100">
            <polygon points="5,95 95,95 5,5" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.7)" strokeWidth="2" />
            {[25, 50, 75].map((p, i) => (
              <line key={i} x1={5 + p * 0.9} y1={95} x2={5 + p * 0.9} y2={92} stroke="rgba(52,211,153,0.5)" strokeWidth="1" />
            ))}
          </svg>
        );
      case "compass":
        return (
          <svg width={80} height={100} viewBox="0 0 80 100">
            <line x1="40" y1="5" x2="20" y2="85" stroke="rgba(251,191,36,0.8)" strokeWidth="2" strokeLinecap="round" />
            <line x1="40" y1="5" x2="60" y2="85" stroke="rgba(251,191,36,0.8)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="40" cy="10" r="5" fill="none" stroke="rgba(251,191,36,0.8)" strokeWidth="1.5" />
            <circle cx="60" cy="88" r="3" fill="rgba(251,191,36,0.8)" />
          </svg>
        );
    }
  };

  return (
    <div
      className="absolute select-none"
      style={{ left: gadget.x, top: gadget.y, transform: `rotate(${gadget.rotation}deg)`, cursor: "grab", zIndex: 10 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="relative group">
        {gadgetContent()}
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500/80 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          ×
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRotate(15); }}
          className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-white/20 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          ↻
        </button>
      </div>
    </div>
  );
}
