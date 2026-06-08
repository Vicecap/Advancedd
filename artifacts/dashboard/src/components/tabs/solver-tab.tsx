import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Sparkles, CheckCircle2, Calculator, BotOff, Bot, Delete, BookOpen, ChevronDown, ChevronUp, Lightbulb, Loader2, Cpu, Share2, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Button, Textarea, Label, Select, Input } from "@/components/ui-elements";
import { useAIModels, useFreeAIModels, useMathCompute, type ComputeStep } from "@/hooks/use-math-api";
import { useSolveStream } from "@/hooks/use-solve-stream";
import { useAuth } from "@/hooks/use-auth";
import GraphTab from "./graph-tab";
import { cn } from "@/lib/utils";
import { CALC_KEYS, ADVANCED_SECTIONS, KEY_MAP } from "@/lib/calc-data";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function logActivity(type: string, description: string, xpEarned: number, tokensUsed = 0) {
  fetch(`${BASE_URL}api/activity`, {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ type, description, xpEarned, tokensUsed }),
  }).catch(() => {});
}

// ── Per-topic solver guide ─────────────────────────────────────────────────────

interface TopicGuide {
  topic: string;
  color: string; bg: string;
  what: string;
  accepts: string[];
  avoid: string[];
  tips: string[];
}

const TOPIC_GUIDES: TopicGuide[] = [
  {
    topic: "Algebra",
    color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/25",
    what: "Handles equations, inequalities, simultaneous equations, expressions, and formula rearrangement.",
    accepts: [
      "Solve 2x + 3 = 7",
      "Solve x^2 - 5x + 6 = 0",
      "Solve simultaneously: 2x + y = 8 and x - y = 1",
      "Expand (x + 3)(x - 2)",
      "Make x the subject: y = 3x - 5",
      "Factorise x^2 + 7x + 12",
    ],
    avoid: [
      "Vague input like 'solve algebra' — always include the actual equation",
      "Using symbols the AI cannot read: writing x² using a superscript character — use x^2 instead",
      "Leaving out the equals sign: 'x + 3 = 7' is correct, 'x + 3 7' is not",
      "Mixing up Solve and Simplify — Solve finds x, Simplify reduces the expression",
    ],
    tips: [
      "Always write the full equation including the = sign",
      "Use ^ for powers: x^2 not x2 or x²",
      "For simultaneous equations list both equations on separate lines or separated by 'and'",
      "Specify what to find: 'solve for x', 'make y the subject', 'find all values of x'",
    ],
  },
  {
    topic: "Calculus",
    color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/25",
    what: "Handles differentiation, integration, turning points, and rates of change (A-Level / Cambridge Additional Maths).",
    accepts: [
      "Differentiate y = 3x^4 - 2x^2 + 5",
      "Find dy/dx for y = sin(x) + x^3",
      "Find the integral of 4x^3 + 2x dx",
      "Find the area under y = x^2 between x = 0 and x = 3",
      "Find turning points of y = x^3 - 3x and determine their nature",
    ],
    avoid: [
      "Asking for calculus at O-Level — standard ZIMSEC/Cambridge O-Level does not include calculus; the AI will solve it but it may be beyond your syllabus",
      "Implicit differentiation of y (e.g. x^2 + y^2 = 25) — the AI handles this but results may need checking",
      "Omitting 'with respect to x' for ambiguous expressions",
    ],
    tips: [
      "Say 'differentiate' or 'find dy/dx' — both work",
      "For integration, specify 'indefinite' or give bounds for definite integrals",
      "Say 'determine the nature' to get max/min classification alongside turning points",
      "Include the full function: 'y = ...' or 'f(x) = ...' form is clearest",
    ],
  },
  {
    topic: "Trigonometry",
    color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/25",
    what: "Handles trig ratios (SOH-CAH-TOA), identities, solving trig equations, and triangle problems.",
    accepts: [
      "Find angle A where sin(A) = 0.5",
      "Solve 2sin(x) - 1 = 0 for 0 ≤ x ≤ 360",
      "In a right triangle: hypotenuse = 10, adjacent = 6. Find all sides and angles.",
      "Prove: sin^2(x) + cos^2(x) = 1",
      "Find the exact value of tan(45°)",
    ],
    avoid: [
      "Writing angles without units — always say 'degrees' or 'radians'",
      "Using degree symbols (°) as text if pasting — write 'degrees' instead if unsure",
      "Skipping the range when solving trig equations — always say e.g. '0 ≤ x ≤ 360'",
      "Asking for a graph — use the Graph Plotter tab instead",
    ],
    tips: [
      "Always state the angle unit: degrees or radians",
      "For triangle problems, say which sides/angles are known",
      "For sine rule or cosine rule problems, say 'use the sine/cosine rule'",
      "Write sin^2(x) not sin²x — the AI reads text, not formatted math",
    ],
  },
  {
    topic: "Geometry",
    color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25",
    what: "Handles Pythagoras, area/perimeter/volume, circle theorems, and angle relationships.",
    accepts: [
      "Find the hypotenuse of a right triangle with legs 5 and 12",
      "Find the area and circumference of a circle with radius 7",
      "A sector has radius 8 and angle 120°. Find arc length and area.",
      "Find the volume of a cylinder with r = 4 and h = 10",
      "What are the interior angles of a regular hexagon?",
    ],
    avoid: [
      "Asking the AI to draw or show a diagram — it cannot produce images",
      "Circle theorem proofs without specifying which theorem (e.g. 'angle at centre is double...')",
      "3D problems that require a diagram to understand — describe the shape fully in text",
    ],
    tips: [
      "Always provide all known measurements with units (cm, m, etc.)",
      "For circle theorems, name the theorem or describe the angle positions",
      "For composite shapes, break them down: 'a shape made of a rectangle + semicircle...'",
      "Use 'leave answer in terms of π' if an exact answer is needed",
    ],
  },
  {
    topic: "Statistics & Probability",
    color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/25",
    what: "Handles mean, median, mode, range, standard deviation, probability, and frequency tables.",
    accepts: [
      "Find the mean, median, and mode of: 4, 7, 7, 9, 11, 13",
      "A bag has 3 red and 5 blue balls. Find P(red)",
      "Two dice are rolled. Find P(sum = 7)",
      "Find the mean from a frequency table: value 2 (freq 3), 4 (freq 5), 6 (freq 2)",
      "Find the standard deviation of: 2, 4, 4, 4, 5, 5, 7, 9",
    ],
    avoid: [
      "Giving data as an image or table — type all values out as a list",
      "Asking for a histogram or frequency polygon — the AI cannot draw graphs",
      "Not listing all data values — the AI cannot guess missing data",
      "Probability without context: 'find P(A)' — always describe what event A is",
    ],
    tips: [
      "List all data values separated by commas",
      "For frequency tables, write: 'value X appears Y times' or 'value: freq'",
      "For probability, describe the sample space clearly",
      "Say 'without replacement' or 'with replacement' for combined events",
    ],
  },
  {
    topic: "Number & Arithmetic",
    color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/25",
    what: "Handles surds, indices/powers, fractions, percentages, LCM, HCF, and standard form.",
    accepts: [
      "Simplify sqrt(48) + 3*sqrt(3)",
      "Evaluate 2^5 × 2^-3 ÷ 2^2 using laws of indices",
      "A price increased 20% to $144. Find the original price.",
      "Express 0.363636... as a fraction",
      "Find the LCM and HCF of 24 and 36",
      "Write 0.000045 in standard form",
    ],
    avoid: [
      "Using the √ symbol typed from keyboard — write sqrt(48) instead",
      "Writing mixed numbers like 2½ — write 2.5 or (2 + 1/2) instead",
      "Indices with negative bases without parentheses: -2^2 means -(2^2), not (-2)^2",
    ],
    tips: [
      "Write surds as sqrt(x) not √x — the AI reads plain text",
      "For indices: use ^ for powers, e.g. 3^4 not 3⁴",
      "For fractions: write 3/4 not ¾",
      "Specify 'simplify', 'evaluate', or 'convert to fraction' to get the right type of answer",
    ],
  },
  {
    topic: "Word Problems",
    color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/25",
    what: "Applied real-world maths: speed/distance/time, interest, ratios, mixtures, and profit/loss.",
    accepts: [
      "A train travels 180 km in 2.5 hours. Find its speed and time for 270 km.",
      "John invests $500 at 4% simple interest per year. How much after 3 years?",
      "A rectangle's perimeter is 34 cm. Length is 5 more than width. Find dimensions.",
      "Profit of 15% on cost price of $200. Find selling price.",
      "Two workers complete a job in 6 and 9 days alone. How long together?",
    ],
    avoid: [
      "Vague problems without numbers: 'a man drives fast' — always include actual values",
      "Multi-part problems all in one sentence — break them into numbered parts",
      "Ambiguous pronouns: 'he sells it to her for more' — name the variables/people clearly",
    ],
    tips: [
      "State all known values with units (km, $, %, hours)",
      "Say exactly what is being asked: 'find the time', 'find the profit', etc.",
      "For rate/ratio problems, state whether it's direct or inverse proportion",
      "Compound interest: say 'compound' — simple interest is the default assumption",
    ],
  },
  {
    topic: "Matrices & Vectors",
    color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/25",
    what: "Handles matrix operations (add, multiply, inverse, determinant) and 2D vector problems.",
    accepts: [
      "Multiply [[1,2],[3,4]] by [[5,6],[7,8]]",
      "Find the inverse of [[3,1],[5,2]]",
      "Find the determinant of [[4,7],[2,6]]",
      "Solve the system: 2x + y = 5 and x - y = 1 using matrices",
      "Vector a = (3,4). Find its magnitude and unit vector.",
    ],
    avoid: [
      "Non-square matrices for inverse — only square matrices have inverses",
      "Multiplying incompatible matrices: m×n times p×q only works when n = p",
      "Using commas inside rows without brackets — write [[row1],[row2]] format",
      "Asking for a 3D vector diagram — the AI gives calculations, not drawings",
    ],
    tips: [
      "Write matrices as [[a,b],[c,d]] using double square brackets",
      "For systems of equations, say 'solve using matrices' or 'use Cramer's rule'",
      "For vectors, write components as (x, y) or (x, y, z)",
      "Say 'find the inverse' or 'find det' — spell out what operation you want",
    ],
  },
];

function AISolverGuide() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors">
        <div className="flex items-center gap-3">
          <BookOpen className="w-4 h-4 text-violet-400" />
          <div className="text-left">
            <span className="text-sm font-semibold text-white">Solver Guide — Supported input, syntax &amp; errors to avoid per topic</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">What the AI solver understands, what causes bad results, and how to phrase questions correctly</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-5 pb-5 pt-2 space-y-3 border-t border-white/8">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TOPIC_GUIDES.map(g => (
                  <button key={g.topic} onClick={() => setActive(active === g.topic ? null : g.topic)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      active === g.topic ? `${g.bg} ${g.color}` : "bg-white/3 border-white/10 text-muted-foreground hover:text-white hover:border-white/20"
                    }`}>
                    {g.topic}
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {active && (() => {
                  const g = TOPIC_GUIDES.find(x => x.topic === active);
                  if (!g) return null;
                  return (
                    <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
                      className={`rounded-xl border p-4 space-y-3 ${g.bg}`}>
                      <div>
                        <p className={`text-xs font-bold mb-0.5 ${g.color}`}>{g.topic}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{g.what}</p>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-1.5">✓ Works well with</p>
                          <ul className="space-y-1">
                            {g.accepts.map((a, i) => (
                              <li key={i} className="text-[11px] font-mono text-emerald-300 bg-emerald-500/10 rounded px-2 py-0.5 leading-snug">{a}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1.5">✗ Causes errors / poor results</p>
                          <ul className="space-y-1.5">
                            {g.avoid.map((a, i) => (
                              <li key={i} className="text-[11px] text-red-300/80 leading-snug flex gap-1.5">
                                <span className="text-red-400 shrink-0 mt-0.5">·</span>{a}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1.5">! Input tips</p>
                          <ul className="space-y-1.5">
                            {g.tips.map((r, i) => (
                              <li key={i} className="text-[11px] text-amber-200/80 leading-snug flex gap-1.5">
                                <span className="text-amber-400 shrink-0 mt-0.5">·</span>{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SolverTabProps {
  initialQuestion?: string;
  onSolutionGenerated?: (solution: string) => void;
}

const BACKEND_OPS: Record<string, string | undefined> = {
  factor: "factor",
  expand: "expand",
  diff: "diff",
  integrate: "integrate",
  limit: "limit",
  simplify: "simplify",
  evaluate: "evaluate",
};


type Personality = "friendly" | "strict" | "exam";

const PERSONALITIES: { v: Personality; label: string; desc: string; color: string; activeColor: string; activeBg: string; activeBorder: string }[] = [
  { v: "friendly", label: "😊 Friendly", desc: "Warm tutor, relatable examples", color: "text-emerald-400", activeColor: "text-emerald-300", activeBg: "rgba(16,185,129,0.18)", activeBorder: "rgba(16,185,129,0.45)" },
  { v: "strict",   label: "📚 Strict",   desc: "Formal, rigorous precision",    color: "text-blue-400",    activeColor: "text-blue-300",    activeBg: "rgba(59,130,246,0.18)",  activeBorder: "rgba(59,130,246,0.45)"  },
  { v: "exam",     label: "🎯 Exam Coach",desc: "Mark-scheme style, ZIMSEC/Cam", color: "text-violet-400",  activeColor: "text-violet-300",  activeBg: "rgba(139,92,246,0.18)", activeBorder: "rgba(139,92,246,0.45)" },
];

export default function SolverTab({ initialQuestion = "", onSolutionGenerated }: SolverTabProps) {
  const [question, setQuestion] = useState(initialQuestion);
  const [model, setModel] = useState("");
  const [topic, setTopic] = useState("solve");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [calcOpen, setCalcOpen] = useState(false);
  const [advancedCalc, setAdvancedCalc] = useState(false);
  const [personality, setPersonality] = useState<Personality>("friendly");
  const [guidedMode, setGuidedMode] = useState(false);
  const [revealedSteps, setRevealedSteps] = useState(0);
  const [eli5Loading, setEli5Loading] = useState(false);
  const [eli5Text, setEli5Text] = useState<string | null>(null);
  const [stepExplanations, setStepExplanations] = useState<Record<number, string>>({});
  const [stepExplainLoading, setStepExplainLoading] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { tokens, isAuthenticated } = useAuth();
  const isDepleted = !!tokens && tokens.balance <= 0;

  const { data: aiModels } = useAIModels();
  const { data: freeModelsData } = useFreeAIModels();
  const { paragraphs, answer, isStreaming, error, startStream } = useSolveStream();
  const { mutate: computeMath, isPending: isComputing, data: mathResult, error: mathError, reset: resetMath } = useMathCompute();

  const allModels = useMemo(() => {
    let premium = (aiModels?.models ?? []).map(m => ({ ...m, free: false as const }));
    if (!isAuthenticated) {
      premium = premium.filter(m => m.id === "qwen/qwen3.5-9b");
    }
    const free = (freeModelsData?.models ?? []).map(m => ({ ...m, free: true as const }));
    return [...premium, ...free];
  }, [aiModels, freeModelsData, isAuthenticated]);

  const isFreeModel = (id: string) => allModels.find(m => m.id === id)?.free ?? false;
  const currentApiBase = isFreeModel(model) ? "/api" : "/api";

  useEffect(() => {
    if (initialQuestion) setQuestion(initialQuestion);
  }, [initialQuestion]);

  useEffect(() => {
    if (allModels.length > 0 && !model) {
      if (isDepleted) {
        const firstFree = allModels.find(m => m.free);
        if (firstFree) { setModel(firstFree.id); return; }
      }
      setModel(allModels[0].id);
    }
  }, [allModels, model, isDepleted]);

  useEffect(() => {
    if (isDepleted && model && !isFreeModel(model)) {
      const firstFree = allModels.find(m => m.free);
      if (firstFree) setModel(firstFree.id);
    }
  }, [isDepleted]);

  const loggedAnswerRef = useRef("");
  useEffect(() => {
    if (answer && answer !== loggedAnswerRef.current) {
      loggedAnswerRef.current = answer;
      logActivity("solve", `${topic}: ${question.slice(0, 120)}`, 15, 0);
      if (onSolutionGenerated) {
        const fullSolution = paragraphs.join("\n\n") + `\n\nFinal Answer: ${answer}`;
        onSolutionGenerated(fullSolution);
      }
    }
  }, [answer, paragraphs, onSolutionGenerated, topic, question]);

  const isLoading = aiEnabled ? isStreaming : isComputing;

  const handleSolve = () => {
    if (!question.trim()) return;
    if (aiEnabled) {
      setRevealedSteps(0);
      setEli5Text(null);
      setStepExplanations({});
      startStream(question, model, topic, personality, currentApiBase);
    } else {
      resetMath();
      computeMath({ expression: question, operation: BACKEND_OPS[topic] });
    }
  };

  const handleEli5 = async () => {
    if (!answer || !paragraphs.length) return;
    setEli5Loading(true);
    setEli5Text(null);
    try {
      const prompt = `Here is a math solution:\n\nQuestion: ${question}\n\nSolution:\n${paragraphs.join("\n")}\n\nFinal Answer: ${answer}\n\nNow explain this entire solution in the simplest possible way — as if you're explaining it to a 10-year-old. Use everyday language, fun analogies, and avoid jargon. Keep it short and friendly.`;
      const discussEndpoint = isFreeModel(model) ? `${BASE_URL}api/discuss` : `${BASE_URL}api/discuss`;
      const res = await fetch(discussEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ prompt, ai: model || "qwen/qwen3.5-9b" }),
      });
      const data = await res.json() as { response?: string };
      setEli5Text(data.response ?? "Sorry, couldn't simplify this one.");
    } catch {
      setEli5Text("Couldn't connect to the AI. Try again.");
    } finally {
      setEli5Loading(false);
    }
  };

  const handleExplainStep = async (idx: number, stepText: string) => {
    if (stepExplainLoading !== null) return;
    setStepExplainLoading(idx);
    try {
      const prompt = `In the context of solving this math problem: "${question}"\n\nExplain this specific step in very simple terms a student can understand:\n"${stepText}"\n\nBe brief (2-3 sentences), avoid jargon, and explain WHY we do this step.`;
      const discussEndpoint2 = isFreeModel(model) ? `${BASE_URL}api/discuss` : `${BASE_URL}api/discuss`;
      const res = await fetch(discussEndpoint2, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ prompt, ai: model || "qwen/qwen3.5-9b" }),
      });
      const data = await res.json() as { response?: string };
      setStepExplanations(prev => ({ ...prev, [idx]: data.response ?? "Couldn't explain this step." }));
    } catch {
      setStepExplanations(prev => ({ ...prev, [idx]: "Couldn't connect to the AI." }));
    } finally {
      setStepExplainLoading(null);
    }
  };

  const insertAtCursor = (value: string) => {
    const el = textareaRef.current;
    if (!el) {
      setQuestion((q) => q + value);
      return;
    }
    const start = el.selectionStart ?? question.length;
    const end = el.selectionEnd ?? question.length;
    const next = question.slice(0, start) + value + question.slice(end);
    setQuestion(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const handleCalcKey = (key: string) => {
    if (!key) return; // spacer
    if (key === "⌫") {
      const el = textareaRef.current;
      const pos = el?.selectionStart ?? question.length;
      if (pos > 0) {
        setQuestion((q) => q.slice(0, pos - 1) + q.slice(pos));
        requestAnimationFrame(() => {
          el?.focus();
          el?.setSelectionRange(pos - 1, pos - 1);
        });
      }
      return;
    }
    if (key === "⌦") {
      setQuestion("");
      textareaRef.current?.focus();
      return;
    }
    insertAtCursor(KEY_MAP[key] ?? key);
  };

  const topics = [
    { value: "solve", label: "Solve Equation" },
    { value: "factor", label: "Factor" },
    { value: "expand", label: "Expand" },
    { value: "diff", label: "Derivative" },
    { value: "integrate", label: "Integrate" },
    { value: "limit", label: "Limit" },
    { value: "divide", label: "Divide Polynomial" },
    { value: "matrix", label: "Matrix Operations" },
    { value: "plot", label: "Plot Function" },
    { value: "simplify", label: "Simplify" },
  ];

  const hasBackendResult = !aiEnabled && (mathResult || mathError);
  const hasAiResult = aiEnabled && (paragraphs.length > 0 || answer || isStreaming);

  const [shareCopied, setShareCopied] = useState(false);
  const handleShareResult = useCallback(async () => {
    const text = [
      `🧮 ZimSolve AI Solution`,
      question ? `Problem: ${question}` : null,
      answer ? `Answer: ${answer}` : null,
      paragraphs.length > 0 ? `\nSteps:\n${paragraphs.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : null,
      `\nSolve it yourself: ${window.location.origin}${window.location.pathname}`,
    ].filter(Boolean).join("\n");
    if (navigator.share) {
      try { await navigator.share({ title: "ZimSolve Solution", text, url: window.location.href }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {}
  }, [question, answer, paragraphs]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <Card>
        <div className="flex items-start justify-between gap-4 mb-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className={cn("p-3 rounded-xl", aiEnabled ? "bg-blue-500/20 text-blue-400" : "bg-slate-500/20 text-slate-400")}>
              {aiEnabled ? <Brain className="w-6 h-6" /> : <Calculator className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-foreground">
                {aiEnabled ? "AI Problem Solver" : "Math Engine Solver"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {aiEnabled ? "AI explains step by step with streaming" : "Fast symbolic/numeric result from backend"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCalcOpen((v) => !v)}
              title="Toggle calculator keyboard"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                calcOpen
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                  : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
              )}
            >
              <Calculator className="w-4 h-4" />
              <span className="hidden sm:inline">Keypad</span>
            </button>

            <button
              onClick={() => setAiEnabled((v) => !v)}
              title={aiEnabled ? "Switch to backend-only mode" : "Switch to AI mode"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                aiEnabled
                  ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                  : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
              )}
            >
              {aiEnabled ? <Bot className="w-4 h-4" /> : <BotOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{aiEnabled ? "AI On" : "AI Off"}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <AnimatePresence>
            {aiEnabled && (
              <motion.div
                key="ai-model"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Label htmlFor="aiSelect">AI Model {isFreeModel(model) && <span className="text-emerald-400 text-[10px] ml-1">· Free</span>}</Label>
                <select
                  id="aiSelect"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm text-white focus:outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.07)", border: isFreeModel(model) ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(255,255,255,0.12)" }}
                >
                  {aiModels?.models && aiModels.models.length > 0 && (
                    <optgroup label="⚡ Premium (10K tokens)" style={{ background: "#0d0f1e" }}>
                      {aiModels.models.map(m => (
                        <option key={m.id} value={m.id} disabled={isDepleted} className="bg-[#0d0f1e]">
                          {m.recommended ? `${m.label} ⭐` : m.label}{isDepleted ? " 🔒" : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {freeModelsData?.models && freeModelsData.models.length > 0 && (
                    <optgroup label="✅ Free Models" style={{ background: "#0d0f1e" }}>
                      {freeModelsData.models.map(m => (
                        <option key={m.id} value={m.id} className="bg-[#0d0f1e]">
                          {m.label} · Free
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </motion.div>
            )}
          </AnimatePresence>
          <div className={!aiEnabled ? "md:col-span-2" : ""}>
            <Label htmlFor="topicSelect">Topic</Label>
            <Select
              id="topicSelect"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              options={topics}
            />
          </div>
        </div>

        {/* ── AI Personality Selector ── */}
        <AnimatePresence>
          {aiEnabled && (
            <motion.div key="personality" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mb-4">
              <Label>Tutor Personality</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {PERSONALITIES.map(p => (
                  <button key={p.v} onClick={() => setPersonality(p.v)}
                    className="rounded-xl px-3 py-2.5 text-left transition-all border"
                    style={personality === p.v
                      ? { background: p.activeBg, borderColor: p.activeBorder }
                      : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)" }
                    }
                  >
                    <p className={cn("text-xs font-bold", personality === p.v ? p.activeColor : "text-muted-foreground")}>{p.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug hidden sm:block">{p.desc}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-4">
          <Label htmlFor="question">Your Question</Label>
          <Textarea
            ref={textareaRef}
            id="question"
            placeholder={aiEnabled ? "Type your question here, e.g. solve 2x + 3 = 7" : "Enter an expression, e.g. 2^10 + sqrt(144)"}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSolve(); }}
            className="text-lg font-mono"
          />
        </div>

        <AnimatePresence>
          {calcOpen && (
            <motion.div
              key="calculator"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-6"
            >
              <div className="rounded-xl border border-indigo-500/20 overflow-hidden" style={{ background: "rgba(99,102,241,0.04)" }}>
                {/* Header with Basic/Advanced toggle */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-500/15" style={{ background: "rgba(99,102,241,0.08)" }}>
                  <p className="text-xs text-indigo-300 font-semibold uppercase tracking-wider">Math Keypad</p>
                  <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <button
                      onClick={() => setAdvancedCalc(false)}
                      className={cn("px-3 py-1 rounded-md text-xs font-semibold transition-all", !advancedCalc ? "bg-indigo-500/40 text-indigo-200" : "text-muted-foreground hover:text-white")}
                    >Basic</button>
                    <button
                      onClick={() => setAdvancedCalc(true)}
                      className={cn("px-3 py-1 rounded-md text-xs font-semibold transition-all", advancedCalc ? "bg-indigo-500/40 text-indigo-200" : "text-muted-foreground hover:text-white")}
                    >Advanced</button>
                  </div>
                </div>

                {!advancedCalc ? (
                  /* ── Basic Keypad ── */
                  <div className="p-3">
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                      {CALC_KEYS.flat().map((key, i) => {
                        const isDelete = key === "⌫";
                        const isClear = key === "⌦";
                        const isFn = ["sin(", "cos(", "tan(", "log("].includes(key);
                        return (
                          <button key={i} onClick={() => handleCalcKey(key)}
                            className={cn(
                              "py-2.5 px-1 rounded-lg text-sm font-mono font-semibold transition-all active:scale-95",
                              isDelete ? "bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30" :
                              isClear  ? "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30" :
                              isFn     ? "bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 border border-purple-500/20 text-xs" :
                                         "bg-white/5 text-foreground hover:bg-white/10 border border-white/10"
                            )}>
                            {key}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">⌫ backspace · ⌦ clear all · click to insert</p>
                  </div>
                ) : (
                  /* ── Advanced Keypad ── */
                  <div className="p-3 space-y-3 max-h-[480px] overflow-y-auto">
                    {ADVANCED_SECTIONS.map((section) => (
                      <div key={section.label}>
                        <p className={cn("text-[10px] font-bold uppercase tracking-widest mb-1.5", section.color)}>{section.label}</p>
                        <div className={cn("rounded-lg p-1.5 border", section.bg, section.border)}
                          style={{ display: "grid", gridTemplateColumns: `repeat(${section.cols}, 1fr)`, gap: "4px" }}>
                          {section.keys.map((key, i) => {
                            const isDelete = key === "⌫";
                            const isClear = key === "⌦";
                            const isEmpty = key === "";
                            return isEmpty ? (
                              <span key={i} />
                            ) : (
                              <button key={i} onClick={() => handleCalcKey(key)}
                                className={cn(
                                  "py-1.5 rounded-md font-mono font-semibold transition-all active:scale-95 text-center leading-none",
                                  key.length > 4 ? "text-[10px]" : key.length > 2 ? "text-xs" : "text-sm",
                                  isDelete ? "bg-orange-500/25 text-orange-300 hover:bg-orange-500/35 border border-orange-500/40" :
                                  isClear  ? "bg-red-500/25 text-red-300 hover:bg-red-500/35 border border-red-500/40" :
                                             cn("hover:bg-white/15 border border-white/10 hover:border-white/25", section.color)
                                )}
                                title={KEY_MAP[key] ? `Inserts: ${KEY_MAP[key]}` : key}
                              >
                                {key}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground text-center pt-1">Hover for inserted value · ⌫ backspace · ⌦ clear all</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleSolve} disabled={isLoading || !question.trim()} className="w-full sm:w-auto">
            {isLoading ? (
              <><span className="mr-2">{aiEnabled ? "Solving" : "Computing"}</span><span className="animate-pulse">…</span></>
            ) : aiEnabled ? (
              <><Sparkles className="w-4 h-4 mr-2" />Solve with AI</>
            ) : (
              <><Calculator className="w-4 h-4 mr-2" />Compute Answer</>
            )}
          </Button>
          {!aiEnabled && (
            <p className="text-xs text-muted-foreground">No AI · fast mathjs engine · Ctrl+Enter to compute</p>
          )}
          {aiEnabled && (
            <p className="text-xs text-muted-foreground">Ctrl+Enter to solve</p>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {!aiEnabled && mathError && <p className="mt-4 text-sm text-destructive">{(mathError as Error).message}</p>}
      </Card>

      <AnimatePresence>
        {hasBackendResult && mathResult && (
          <motion.div key="backend-result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-t-4 border-t-emerald-500">
              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/10">
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-bold text-foreground">Result</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Backend · mathjs engine</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <Label>Answer</Label>
                  <Input
                    readOnly
                    value={mathResult.result}
                    className="font-mono text-lg text-emerald-400 border-emerald-500/30 bg-emerald-500/5 focus-visible:border-emerald-500/30"
                  />
                </div>
                {mathResult.steps && mathResult.steps.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Step-by-Step Working</Label>
                      <span className="text-[10px] text-muted-foreground font-mono">{mathResult.steps.length} steps</span>
                    </div>
                    {mathResult.steps.map((s: ComputeStep, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, type: "spring", stiffness: 270, damping: 25 }}
                        className="flex gap-0 rounded-xl overflow-hidden"
                        style={{ border: "1px solid rgba(16,185,129,0.15)" }}
                      >
                        <div className="w-1 shrink-0" style={{ background: `hsl(${162 - i * 10},70%,48%)` }} />
                        <div className="flex gap-3 p-3 flex-1 min-w-0" style={{ background: "rgba(16,185,129,0.04)" }}>
                          <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5"
                            style={{ background: `hsl(${162 - i * 10},65%,14%)`, border: `1px solid hsl(${162 - i * 10},55%,32%)`, color: `hsl(${162 - i * 10},75%,62%)` }}>
                            {s.step}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-slate-200 text-sm font-semibold leading-snug">{s.label}</p>
                            {s.expression && (
                              <div className="rounded-lg px-3 py-2"
                                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(16,185,129,0.18)" }}>
                                <code className="text-emerald-300 font-mono text-[13px] break-all">{s.expression}</code>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
                {mathResult.isNumeric && mathResult.numericValue != null && (
                  <p className="text-xs text-muted-foreground font-mono">Numeric ≈ {mathResult.numericValue}</p>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {hasAiResult && (
          <motion.div key="ai-result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="border-t-4 border-t-green-500">
              <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-green-500/20 text-green-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-bold text-foreground">Solution</h2>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      AI · {PERSONALITIES.find(p => p.v === personality)?.label ?? "Streaming"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isStreaming && paragraphs.length > 0 && (
                    <>
                      <button
                        onClick={handleShareResult}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border"
                        style={shareCopied
                          ? { background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)", color: "#34d399" }
                          : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }
                        }
                        title="Share this solution"
                      >
                        {shareCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                        {shareCopied ? "Copied!" : "Share"}
                      </button>
                      <button
                        onClick={() => { setGuidedMode(v => !v); setRevealedSteps(v => v === 0 ? 1 : v); }}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border",
                          guidedMode
                            ? "bg-violet-500/25 text-violet-300 border-violet-500/50"
                            : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/25 hover:text-white"
                        )}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {guidedMode ? "Exit Guided" : "Guided Mode"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <Label>Answer</Label>
                  <Input
                    readOnly
                    value={answer || "Calculating…"}
                    className="font-mono text-lg text-green-400 border-green-500/30 bg-green-500/5 focus-visible:border-green-500/30"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Step-by-Step Breakdown</Label>
                    {guidedMode && paragraphs.length > 0 && !isStreaming && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {Math.min(revealedSteps, paragraphs.length)}/{paragraphs.length} steps revealed
                      </span>
                    )}
                  </div>

                  {guidedMode && !isStreaming ? (
                    /* ── GUIDED MODE: reveal steps one by one ── */
                    <div className="space-y-3">
                      <AnimatePresence>
                        {paragraphs.slice(0, revealedSteps).map((step, i) => (
                          <motion.div key={i}
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl border border-white/10 overflow-hidden"
                            style={{ background: "rgba(0,0,0,0.25)" }}
                          >
                            <div className="flex gap-3 p-4">
                              <span className="text-green-400 font-bold font-mono shrink-0 text-sm mt-0.5">{i + 1}.</span>
                              <p className="text-slate-300 text-sm leading-relaxed flex-1">{step}</p>
                            </div>
                            <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                              {stepExplanations[i] ? (
                                <div className="w-full rounded-lg p-3 text-xs leading-relaxed text-amber-200/90 mt-1"
                                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                                  <span className="font-bold text-amber-400 block mb-1">💡 Explanation</span>
                                  {stepExplanations[i]}
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleExplainStep(i, step)}
                                  disabled={stepExplainLoading !== null}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border disabled:opacity-50"
                                  style={{ background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.25)", color: "rgba(251,191,36,0.8)" }}
                                >
                                  {stepExplainLoading === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lightbulb className="w-3 h-3" />}
                                  Explain this step
                                </button>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {revealedSteps < paragraphs.length && (
                        <button
                          onClick={() => setRevealedSteps(s => s + 1)}
                          className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                          style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "rgba(52,211,153,0.9)" }}
                        >
                          <ChevronDown className="w-4 h-4" />
                          Reveal Step {revealedSteps + 1} of {paragraphs.length}
                        </button>
                      )}

                      {revealedSteps >= paragraphs.length && paragraphs.length > 0 && (
                        <div className="text-center py-2 text-xs text-emerald-400 font-semibold">
                          ✓ All steps revealed
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ── NORMAL MODE: visual numbered step cards ── */
                    <div className="space-y-2">
                      {paragraphs.map((p, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04, type: "spring", stiffness: 280, damping: 26 }}
                          className="flex gap-0 rounded-xl overflow-hidden"
                          style={{ border: "1px solid rgba(34,197,94,0.18)" }}
                        >
                          <div className="w-1 shrink-0" style={{ background: `hsl(${140 - i * 10},65%,48%)` }} />
                          <div className="flex gap-3 p-3.5 flex-1 min-w-0" style={{ background: "rgba(34,197,94,0.04)" }}>
                            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5"
                              style={{ background: `hsl(${140 - i * 10},65%,14%)`, border: `1px solid hsl(${140 - i * 10},55%,32%)`, color: `hsl(${140 - i * 10},75%,62%)` }}>
                              {i + 1}
                            </div>
                            <p className="text-slate-200 text-sm leading-relaxed flex-1">{p}</p>
                          </div>
                        </motion.div>
                      ))}
                      {isStreaming && (
                        <div className="flex gap-1.5 px-4 py-3">
                          {[0,1,2].map(j => (
                            <span key={j} className="w-2 h-2 rounded-full bg-green-400 animate-bounce"
                              style={{ animationDelay: `${j * 0.15}s` }} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── ELI5 Button + Result ── */}
                {answer && !isStreaming && (
                  <div className="pt-2 space-y-3">
                    {!eli5Text && (
                      <button
                        onClick={handleEli5}
                        disabled={eli5Loading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 border"
                        style={{ background: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.3)", color: "rgba(251,191,36,0.9)" }}
                      >
                        {eli5Loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                        {eli5Loading ? "Simplifying…" : "Explain Like I'm 10"}
                      </button>
                    )}
                    <AnimatePresence>
                      {eli5Text && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="rounded-xl p-4 space-y-2"
                          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Simple Explanation</span>
                            </div>
                            <button onClick={() => setEli5Text(null)} className="text-muted-foreground hover:text-white text-xs">✕ Close</button>
                          </div>
                          <p className="text-sm text-amber-100/90 leading-relaxed">{eli5Text}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {topic === "plot" && question && !isStreaming && aiEnabled && (
        <div className="mt-8">
          <h3 className="text-lg font-display font-bold mb-4">Generated Graph</h3>
          <GraphTab initialFunction={question} hideHeader />
        </div>
      )}

      <AISolverGuide />
    </motion.div>
  );
}
