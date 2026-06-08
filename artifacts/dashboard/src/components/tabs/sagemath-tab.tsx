import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, RotateCcw, ExternalLink, Copy, Check,
  Loader2, Sparkles, Github, ChevronDown, BookOpen,
  Calculator, Sigma, Triangle, BarChart3, Hash, Infinity,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

const FREE_MODELS = ["qwen2.5:7b", "qwen2.5:latest", "llama3.2:3b"];
function isFreeModel(m: string) { return FREE_MODELS.includes(m); }

// ── Topics ────────────────────────────────────────────────────────────────────

interface Topic {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  examples: string[];
}

const TOPICS: Topic[] = [
  {
    id: "algebra",
    label: "Algebra",
    icon: Calculator,
    color: "text-violet-400",
    examples: [
      "Factorise x² − 5x + 6",
      "Solve 2x² + 3x − 5 = 0",
      "Expand and simplify (2x + 3)(x − 4)",
      "Solve simultaneous equations: 2x + y = 7 and x − y = 2",
      "Make r the subject of A = πr²",
    ],
  },
  {
    id: "calculus",
    label: "Calculus",
    icon: Infinity,
    color: "text-blue-400",
    examples: [
      "Differentiate y = 3x³ + 2x² − 5x + 1",
      "Find the integral of 4x³ − 6x + 2",
      "Find the stationary points of y = x³ − 3x",
      "Find the gradient of y = x² at x = 3",
      "Find the area under y = x² between x = 0 and x = 2",
    ],
  },
  {
    id: "trigonometry",
    label: "Trigonometry",
    icon: Triangle,
    color: "text-cyan-400",
    examples: [
      "Find the missing side: right triangle, hypotenuse 13, angle 35°",
      "Solve the triangle: a=8, b=10, C=60° using cosine rule",
      "Find all angles where sin(x) = 0.5 for 0° ≤ x ≤ 360°",
      "Prove that sin²θ + cos²θ = 1",
      "A ladder 5m long leans against a wall at 72°. How high does it reach?",
    ],
  },
  {
    id: "statistics",
    label: "Statistics",
    icon: BarChart3,
    color: "text-yellow-400",
    examples: [
      "Find the mean, median and mode of: 4, 7, 3, 9, 5, 7, 6",
      "Calculate the interquartile range of: 12, 15, 18, 20, 22, 25, 28",
      "A bag has 3 red, 4 blue, 5 green balls. Find P(red or blue)",
      "Two dice rolled. Find probability of getting a sum of 7",
      "Find the standard deviation of: 5, 8, 12, 15, 20",
    ],
  },
  {
    id: "number",
    label: "Number",
    icon: Hash,
    color: "text-emerald-400",
    examples: [
      "Write 360 as a product of prime factors",
      "Find the HCF and LCM of 24 and 36",
      "Simplify: (27)^(2/3)",
      "Rationalise the denominator: 5 / (2 + √3)",
      "Convert 0.363636... to a fraction",
    ],
  },
  {
    id: "geometry",
    label: "Geometry",
    icon: Sigma,
    color: "text-pink-400",
    examples: [
      "Find the area of a sector with radius 8 cm and angle 45°",
      "Find the volume of a cone with radius 5 cm and height 12 cm",
      "A regular polygon has interior angles of 135°. How many sides?",
      "Find the surface area of a sphere with radius 6 cm",
      "Circle theorem: angle at centre is 110°. Find the angle at the circumference.",
    ],
  },
  {
    id: "matrices",
    label: "Matrices",
    icon: FlaskConical,
    color: "text-orange-400",
    examples: [
      "Find the inverse of the matrix [[2, 3], [1, 4]]",
      "Multiply matrices [[1,2],[3,4]] and [[5,6],[7,8]]",
      "Find the determinant of [[3, -2], [1, 4]]",
      "Solve the system using matrices: 3x + 2y = 7, x − y = 1",
      "Find the eigenvalues of [[4, 1], [2, 3]]",
    ],
  },
];

// ── Streaming hook ────────────────────────────────────────────────────────────

function useAiStream() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (system: string, message: string, model = "qwen/qwen3.5-122b-a10b") => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setText(""); setLoading(true); setError(null);

    try {
      const endpoint = isFreeModel(model) ? api("/open-assist") : api("/open-assist");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ system, message, model }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error("AI unavailable");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6)) as { delta?: string; done?: boolean; error?: string };
            if (d.error) throw new Error(d.error);
            if (d.delta) setText(prev => prev + d.delta);
          } catch {}
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  const cancel = () => { abortRef.current?.abort(); setLoading(false); };
  const reset  = () => { setText(""); setError(null); };
  return { text, loading, error, run, cancel, reset };
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function RenderAnswer({ text }: { text: string }) {
  const blocks = text.split(/```[\w]*\n?/);
  return (
    <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
      {blocks.map((block, i) => {
        if (i % 2 === 1) {
          return (
            <pre key={i} className="overflow-x-auto rounded-xl p-4 text-[12px] font-mono text-emerald-300 leading-relaxed"
              style={{ background: "#0a140d", border: "1px solid rgba(52,211,153,0.2)" }}>
              {block.trim()}
            </pre>
          );
        }
        return (
          <div key={i} className="space-y-1.5">
            {block.split("\n").map((line, j) => {
              if (!line.trim()) return <div key={j} className="h-1" />;
              if (line.startsWith("## ")) return <p key={j} className="text-base font-bold text-white mt-4 first:mt-0">{line.slice(3)}</p>;
              if (line.startsWith("# ")) return <p key={j} className="text-lg font-bold text-white mt-4 first:mt-0">{line.slice(2)}</p>;
              if (line.startsWith("**") && line.endsWith("**")) return <p key={j} className="font-bold text-white mt-3">{line.slice(2,-2)}</p>;
              if (line.startsWith("- ") || line.startsWith("• ")) return <p key={j} className="pl-3 flex gap-2"><span className="text-indigo-400 shrink-0">▸</span>{line.slice(2)}</p>;
              const bParts = line.split(/\*\*([^*]+)\*\*/g);
              if (bParts.length > 1) return <p key={j}>{bParts.map((p, k) => k % 2 === 1 ? <strong key={k} className="text-white">{p}</strong> : p)}</p>;
              const cParts = line.split(/`([^`]+)`/g);
              if (cParts.length > 1) return <p key={j}>{cParts.map((p, k) => k % 2 === 1 ? <code key={k} className="px-1.5 py-0.5 rounded text-[11px] font-mono text-emerald-300 bg-emerald-500/10">{p}</code> : p)}</p>;
              return <p key={j}>{line}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── History item ──────────────────────────────────────────────────────────────

interface HistoryItem { question: string; answer: string; topic: string }

// ── Main component ────────────────────────────────────────────────────────────

const SAGE_SYSTEM = `You are a SageMath-powered AI mathematics tutor for ZIMSEC and Cambridge O-Level students. When a student asks a math question:

1. **Solve it completely** with full step-by-step working — show every single step clearly numbered
2. **Show the SageMath / Python command** that computes this (in a code block) — so students can verify with the software
3. **Explain the method** used in simple, clear language
4. **Give the final answer** clearly highlighted
5. **Add an exam tip** relevant to ZIMSEC or Cambridge papers

Format your response with clear sections. Use ## headings. Make it educational and encouraging. Never skip steps.`;

export default function SageMathTab() {
  const { isAuthenticated } = useAuth();
  const [question, setQuestion] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<Topic>(TOPICS[0]);
  const [model, setModel] = useState("qwen/qwen3.5-122b-a10b");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistory, setActiveHistory] = useState<HistoryItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExamples, setShowExamples] = useState(true);
  const ai = useAiStream();
  const outputRef = useRef<HTMLDivElement>(null);

  const solve = async (q: string) => {
    if (!q.trim() || ai.loading) return;
    const q2 = q.trim();
    setQuestion("");
    setActiveHistory(null);
    ai.reset();
    await ai.run(SAGE_SYSTEM, `Topic: ${selectedTopic.label}\n\nQuestion: ${q2}`, model);
    setHistory(prev => [{ question: q2, answer: ai.text, topic: selectedTopic.label }, ...prev.slice(0, 9)]);
    setTimeout(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const copyAnswer = () => {
    const text = activeHistory?.answer ?? ai.text;
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const displayText = activeHistory?.answer ?? ai.text;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="rounded-2xl p-5 flex items-start gap-4" style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.1), rgba(99,102,241,0.06))", border: "1px solid rgba(52,211,153,0.22)" }}>
        <div className="p-3 rounded-2xl text-2xl shrink-0" style={{ background: "rgba(52,211,153,0.18)", border: "1px solid rgba(52,211,153,0.35)" }}>🧮</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-display font-black text-white">SageMath Solver</h2>
            <a href="https://github.com/sagemath/sage" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border border-white/15 text-muted-foreground hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <Github className="w-3 h-3" /> sagemath/sage <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Type any maths question below. The AI solves it step by step using SageMath methods — showing you the working, the formula, and even the SageMath command to verify the answer yourself.
          </p>
        </div>
      </div>

      {/* Topic selector */}
      <div className="flex flex-wrap gap-2">
        {TOPICS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => { setSelectedTopic(t); setShowExamples(true); }}
              className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all", selectedTopic.id === t.id ? `${t.color} border-current bg-white/8` : "text-muted-foreground border-white/10 hover:text-white hover:border-white/20")}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Input panel */}
        <div className="lg:col-span-1 space-y-3">

          {/* Example questions */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <button onClick={() => setShowExamples(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <span className="flex items-center gap-2">
                <BookOpen className={cn("w-4 h-4", selectedTopic.color)} />
                {selectedTopic.label} Examples
              </span>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showExamples && "rotate-180")} />
            </button>
            <AnimatePresence>
              {showExamples && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                  className="overflow-hidden">
                  <div className="p-2 space-y-1">
                    {selectedTopic.examples.map((ex, i) => (
                      <button key={i} onClick={() => { setQuestion(ex); setActiveHistory(null); }}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/8">
                        <span className={cn("text-[10px] font-bold mr-2 uppercase", selectedTopic.color)}>Q{i+1}</span>
                        {ex}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Question input */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Question</p>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); solve(question); } }}
              rows={5}
              placeholder={`Type your ${selectedTopic.label.toLowerCase()} question here…\n\nExamples:\n• ${selectedTopic.examples[0]}`}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm resize-none focus:outline-none focus:border-emerald-400/50 transition-colors placeholder:text-muted-foreground/60 leading-relaxed"
            />
          </div>

          {/* Model + Solve */}
          <div className="space-y-2">
            <select value={model} onChange={e => setModel(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none">
              <optgroup label="Free Models">
                <option value="qwen2.5:7b">Qwen 2.5 7B — Free</option>
                <option value="qwen2.5:latest">Qwen 2.5 — Free</option>
                <option value="llama3.2:3b">Llama 3.2 3B — Free</option>
              </optgroup>
              <optgroup label="Premium Models">
                {isAuthenticated ? (
                  <>
                    <option value="qwen/qwen3.5-122b-a10b">Qwen 122B — Most Accurate</option>
                    <option value="qwen/qwen3.5-27b">Qwen 27B — Balanced</option>
                    <option value="qwen/qwen3.5-9b">Qwen 9B — Fastest</option>
                    <option value="openai/gpt-5.4-mini">GPT-5.4 Mini</option>
                  </>
                ) : (
                  <option value="qwen/qwen3.5-9b">Qwen 9B — Fastest (Sign in for more)</option>
                )}
              </optgroup>
            </select>
            {ai.loading ? (
              <button onClick={ai.cancel}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-red-300 border border-red-500/30 transition-all"
                style={{ background: "rgba(239,68,68,0.1)" }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Solving… (click to stop)
              </button>
            ) : (
              <button onClick={() => solve(question)} disabled={!question.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all glow-btn"
                style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.35), rgba(99,102,241,0.3))", border: "1px solid rgba(52,211,153,0.45)" }}>
                <Sparkles className="w-4 h-4" /> Solve with SageMath AI
              </button>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent</p>
              {history.slice(0,5).map((h, i) => (
                <button key={i} onClick={() => setActiveHistory(h)}
                  className={cn("w-full text-left px-3 py-2.5 rounded-xl border transition-all", activeHistory === h ? "border-indigo-500/40 bg-indigo-500/10" : "border-white/8 hover:border-white/15 hover:bg-white/5")}>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">{h.topic}</p>
                  <p className="text-xs text-white mt-0.5 line-clamp-2">{h.question}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Answer panel */}
        <div className="lg:col-span-2 space-y-2" ref={outputRef}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-white">Solution</span>
              {activeHistory && <span className="text-xs text-muted-foreground">— from history</span>}
            </div>
            <div className="flex gap-2">
              {displayText && (
                <>
                  <button onClick={ai.reset} className="p-1.5 rounded-lg text-muted-foreground hover:text-white border border-white/8 hover:border-white/15 transition-all">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={copyAnswer} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white transition-all">
                    {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl min-h-96 p-5 overflow-y-auto max-h-[680px]"
            style={{ background: "rgba(52,211,153,0.03)", border: "1px solid rgba(52,211,153,0.15)" }}>
            {!displayText && !ai.loading && !ai.error && (
              <div className="flex flex-col items-center justify-center h-80 gap-4 text-center">
                <div className="text-5xl">🧮</div>
                <div className="space-y-2">
                  <p className="text-base font-semibold text-white">Ready to Solve</p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Choose a topic, pick an example or type your own question, then click <span className="text-emerald-400 font-semibold">Solve with SageMath AI</span>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {TOPICS.slice(0,4).map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} onClick={() => { setSelectedTopic(t); solve(t.examples[0]); }}
                        className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all border-white/10 hover:border-white/20 text-muted-foreground hover:text-white")}>
                        <Icon className={cn("w-3.5 h-3.5", t.color)} /> Try {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {ai.error && (
              <div className="p-4 rounded-xl text-sm text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {ai.error}
              </div>
            )}
            {ai.loading && !ai.text && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                <p className="text-sm text-muted-foreground">SageMath AI is solving your question…</p>
              </div>
            )}
            {displayText && <RenderAnswer text={displayText} />}
            {ai.loading && ai.text && (
              <div className="flex items-center gap-2 mt-3 text-xs text-emerald-400/70">
                <Loader2 className="w-3 h-3 animate-spin" /> Generating…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* About */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-400" /> What is SageMath?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="font-semibold text-white mb-1">🔓 Free & Open Source</p>
            <p>SageMath is a free computer algebra system that covers algebra, calculus, statistics, and more — built on Python. Used by universities worldwide.</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="font-semibold text-white mb-1">🌐 Try It Online</p>
            <p>Use sagecell.sagemath.org in your browser for free — no installation needed. Run the SageMath commands shown in your solutions above.</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="font-semibold text-white mb-1">📐 ZIMSEC Ready</p>
            <p>Every solution is aligned to ZIMSEC and Cambridge O-Level methods. Step-by-step working is shown exactly as expected in examinations.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
