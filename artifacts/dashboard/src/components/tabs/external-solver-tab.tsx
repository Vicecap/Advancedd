import React, { useEffect, useRef, useState, useCallback } from "react";
import { Globe, CheckCircle2, AlertCircle, Calculator, Bot, BotOff, Sparkles, ListOrdered, ChevronDown, ChevronUp, BookOpen, FlaskConical, Share2, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Button, Textarea, Label, Select, Input } from "@/components/ui-elements";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { CALC_KEYS, ADVANCED_SECTIONS, KEY_MAP } from "@/lib/calc-data";

const BASE_URL_EXT = import.meta.env.BASE_URL ?? "/";
function apiExt(p: string) { return `${BASE_URL_EXT}api${p}`; }
function logActivity(type: string, description: string, xpEarned: number) {
  fetch(apiExt("/activity"), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, description, xpEarned }),
  }).catch(() => {});
}

// ── Solver syntax guide ────────────────────────────────────────────────────────

interface OpGuide {
  op: string;
  color: string; bg: string;
  what: string;
  accepts: string[];
  avoid: string[];
  syntaxRules: string[];
}

const OPERATION_GUIDES: OpGuide[] = [
  {
    op: "Simplify",
    color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/25",
    what: "Collects like terms, expands brackets, and cancels. Only uses x as a variable.",
    accepts: ["x^2 + 2x + 1", "(x+1)(x-1)", "2x + 4x - x", "x^2/x"],
    avoid: [
      "y, z, a, b — only x is supported as a variable",
      "Equations like x^2 = 4 — do not use = sign",
      "Fractions with complex denominators may not simplify fully",
    ],
    syntaxRules: [
      "Use ^ for powers: x^2 not x**2",
      "Write coefficients before x with no space: 3x or 3*x, not x3",
      "Use parentheses to group: (x+1)^2 not x+1^2",
    ],
  },
  {
    op: "Factor",
    color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/25",
    what: "Breaks a polynomial into its factors. Works best with polynomials in x.",
    accepts: ["x^2 - 9", "x^2 + 5x + 6", "2x^2 + 4x", "x^3 - 8"],
    avoid: [
      "Non-factorable polynomials (irrational roots) — result may be the same expression",
      "Expressions with = sign — Factor expects an expression, not an equation",
      "Multiple variables: x^2 + y^2 — only x is supported",
    ],
    syntaxRules: [
      "Input just the expression, no = 0 at the end",
      "Use ^ for exponents: x^2 not x2 or x²",
      "Coefficients must be integers or simple fractions",
    ],
  },
  {
    op: "Derivative",
    color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/25",
    what: "Differentiates with respect to x. Supports polynomial, trig, log, and exponential.",
    accepts: ["x^3 + 2x", "sin(x)", "e^x", "ln(x)", "x^2 * sin(x)", "1/(x+1)"],
    avoid: [
      "Implicit differentiation: y^2 + x = 5 — Newton cannot do implicit",
      "Partial derivatives with multiple variables",
      "Expressions written as dy/dx — just input the expression itself",
    ],
    syntaxRules: [
      "Use e^x for the natural exponential — not exp(x)",
      "Use ln(x) for natural log — not log10(x) or log(x, 10)",
      "Multiplication must be explicit: 2*sin(x) or x*cos(x)",
    ],
  },
  {
    op: "Integrate",
    color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25",
    what: "Finds the indefinite integral (antiderivative). No bounds — for definite integrals use Area.",
    accepts: ["x^2", "cos(x)", "1/x", "e^x", "x*e^x", "sin(x)/x^2"],
    avoid: [
      "Bounds like 'from 0 to 4' — use the Area operation instead",
      "Expressions that have no closed-form integral (e^(x^2), sin(x)/x) — will fail",
      "Writing ∫ or dx in the input — input the expression only",
    ],
    syntaxRules: [
      "Input only the integrand — no ∫ symbol, no dx",
      "Use ln(x) not log(x) for natural log input",
      "Result always has implicit +C (constant of integration)",
    ],
  },
  {
    op: "Find Zeros",
    color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/25",
    what: "Finds values of x where f(x) = 0. Input the expression, not the equation.",
    accepts: ["x^2 - 4", "x^2 - x - 6", "x^3 - x", "sin(x)"],
    avoid: [
      "Equations with = sign: x^2 = 4 — input x^2 - 4 instead",
      "Complex roots — Newton only returns real zeros",
      "Expressions with no real zeros return an empty result, not an error",
    ],
    syntaxRules: [
      "Rearrange equation to f(x) = 0 form — input only f(x)",
      "Example: to find zeros of x^2 = 9, input x^2 - 9",
    ],
  },
  {
    op: "Tangent Line",
    color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/25",
    what: "Returns the equation of the tangent line at a given x-value. Special format required.",
    accepts: ["2|x^3", "0|sin(x)", "1|x^2 + x", "-1|e^x"],
    avoid: [
      "Missing the pipe separator: '2 x^3' or '2, x^3' — MUST use point|expression",
      "Non-differentiable points like 0|1/x — tangent is undefined there",
      "Points outside the domain: e.g. -1|ln(x) — ln(x) not defined at x=-1",
    ],
    syntaxRules: [
      "Format MUST be: point|expression — e.g. 3|x^2",
      "The number before | is the x-value where you want the tangent",
      "No spaces around the | separator",
    ],
  },
  {
    op: "Area Under Curve",
    color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/25",
    what: "Definite integral between two bounds. Returns a numeric area. Special format required.",
    accepts: ["0:4|x^2", "0:3.14159|sin(x)", "1:3|2x + 1", "-1:1|x^3"],
    avoid: [
      "Using π directly — write 3.14159 or 3.14159265 instead",
      "Bounds where the function is undefined: 0:2|1/x — singularity at 0",
      "Reversed bounds (e.g. 4:0) — result will be the negative of the expected area",
    ],
    syntaxRules: [
      "Format MUST be: from:to|expression — e.g. 0:5|x^2",
      "Bounds are decimal numbers — no π symbol, no fractions",
      "No spaces around : or |",
    ],
  },
  {
    op: "Sin / Cos / Tan",
    color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/25",
    what: "Evaluates the trig function at a given angle. Input is numeric — angle in radians.",
    accepts: ["0", "1.5707963 (= π/2)", "3.14159265 (= π)", "0.7853981 (= π/4)"],
    avoid: [
      "Degree values like 90 — Newton uses radians not degrees",
      "Expressions like sin(π/4) — input the numeric value of the angle only",
      "tan(π/2) — undefined (vertical asymptote), will return error",
    ],
    syntaxRules: [
      "Input is the angle value in radians as a decimal",
      "To use degrees: convert first — degrees × π/180",
      "90° = 1.5707963 rad, 180° = 3.14159 rad, 360° = 6.28318 rad",
    ],
  },
  {
    op: "Arcsin / Arccos / Arctan",
    color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/25",
    what: "Inverse trig: returns the angle whose sin/cos/tan equals the input value.",
    accepts: ["0", "0.5", "1", "-1", "-0.5", "0.7071 (= √2/2)"],
    avoid: [
      "Values outside [-1, 1] for arcsin and arccos — WILL cause an error",
      "Expressions like arcsin(x^2) — input must be a numeric value",
      "arccos(2) or arcsin(-3) — domain error",
    ],
    syntaxRules: [
      "Input must be a number between -1 and 1 for arcsin and arccos",
      "arctan accepts any real number (no domain restriction)",
      "Result is returned in radians",
    ],
  },
  {
    op: "Logarithm",
    color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/25",
    what: "Computes the natural logarithm (base e) of a positive number.",
    accepts: ["1", "2.71828 (= e)", "10", "100", "0.5"],
    avoid: [
      "Zero or negative numbers: log(0) and log(-1) — undefined, WILL cause error",
      "Expressions like log(x^2) — input must be numeric",
      "Confusing with log base 10: this computes ln, not log₁₀",
    ],
    syntaxRules: [
      "Input must be a positive number greater than zero",
      "Returns the natural log (base e), not base 10",
      "To compute log₁₀: divide result by ln(10) ≈ 2.302",
    ],
  },
  {
    op: "Absolute Value",
    color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/25",
    what: "Returns |expression|. Works with both numeric values and expressions in x.",
    accepts: ["-5", "x - 3", "x^2 - 4", "2x + 1"],
    avoid: [
      "Using |x| notation in the text box — the API reads the field, not display math",
      "Complex expressions with multiple nested absolutes may give unexpected results",
    ],
    syntaxRules: [
      "Input the expression directly — the API wraps it in abs() automatically",
      "Do NOT type |x| in the field — just type x or x - 3",
    ],
  },
];

function ExternalSolverGuide() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.02)" }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors">
        <div className="flex items-center gap-3">
          <BookOpen className="w-4 h-4 text-teal-400" />
          <div className="text-left">
            <span className="text-sm font-semibold text-white">Solver Guide — Supported values, syntax &amp; errors to avoid</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">What each operation accepts, what to avoid, and common syntax mistakes</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-5 pb-5 pt-2 space-y-3 border-t border-white/8">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {OPERATION_GUIDES.map(g => (
                  <button key={g.op} onClick={() => setActive(active === g.op ? null : g.op)}
                    className={cn("text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all",
                      active === g.op ? `${g.bg} ${g.color}` : "bg-white/3 border-white/10 text-muted-foreground hover:text-white hover:border-white/20")}>
                    {g.op}
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {active && (() => {
                  const g = OPERATION_GUIDES.find(x => x.op === active);
                  if (!g) return null;
                  return (
                    <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
                      className={`rounded-xl border p-4 space-y-3 ${g.bg}`}>
                      <div>
                        <p className={`text-xs font-bold mb-0.5 ${g.color}`}>{g.op}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{g.what}</p>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-1.5">✓ Accepted input</p>
                          <ul className="space-y-1">
                            {g.accepts.map((a, i) => (
                              <li key={i} className="text-[11px] font-mono text-emerald-300 bg-emerald-500/10 rounded px-2 py-0.5">{a}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1.5">✗ Avoid / causes errors</p>
                          <ul className="space-y-1.5">
                            {g.avoid.map((a, i) => (
                              <li key={i} className="text-[11px] text-red-300/80 leading-snug flex gap-1.5">
                                <span className="text-red-400 shrink-0 mt-0.5">·</span>{a}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1.5">! Syntax rules</p>
                          <ul className="space-y-1.5">
                            {g.syntaxRules.map((r, i) => (
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

interface ExternalResult {
  result: string;
  source: string;
  operation?: string;
  expression?: string;
}

interface AIParagraph {
  text: string;
  id: number;
}

const NEWTON_OPS = [
  { value: "simplify",  label: "Simplify" },
  { value: "factor",    label: "Factor" },
  { value: "derive",    label: "Derivative" },
  { value: "integrate", label: "Integrate" },
  { value: "zeroes",    label: "Find Zeros" },
  { value: "tangent",   label: "Tangent Line" },
  { value: "area",      label: "Area Under Curve" },
  { value: "cos",       label: "Cosine" },
  { value: "sin",       label: "Sine" },
  { value: "tan",       label: "Tangent" },
  { value: "arccos",    label: "Arccos" },
  { value: "arcsin",    label: "Arcsin" },
  { value: "arctan",    label: "Arctan" },
  { value: "abs",       label: "Absolute Value" },
  { value: "log",       label: "Logarithm" },
];

const SOURCES = [
  { value: "newton",  label: "Newton API (symbolic — open source)" },
  { value: "mathjs",  label: "api.mathjs.org (numeric / algebraic)" },
];

const PREMIUM_AI_MODELS = [
  { value: "qwen/qwen3.5-9b",           label: "Qwen 3.5 9B (Fast)" },
  { value: "google/gemini-flash-1.5",   label: "Gemini Flash 1.5" },
  { value: "openai/gpt-4o-mini",        label: "GPT-4o Mini" },
  { value: "anthropic/claude-3-haiku",  label: "Claude 3 Haiku" },
];

const FREE_AI_MODELS = [
  { value: "qwen2.5:7b",      label: "Qwen 2.5 7B (Free)" },
  { value: "qwen2.5:latest",  label: "Qwen 2.5 Latest (Free)" },
  { value: "llama3.2:3b",     label: "Llama 3.2 3B (Free)" },
];

function isFreeAiModel(m: string) { return FREE_AI_MODELS.some(x => x.value === m); }

const SOURCE_NOTES: Record<string, string> = {
  newton: "GitHub: aunyks/newton-api · symbolic algebra — supports factor, derive, integrate, trig, zeroes",
  mathjs: "mathjs.org · evaluates any numeric or algebraic expression — same engine our backend uses",
};

interface LocalStep { step: number; label: string; expression: string; }
interface LocalComputeResult { result: string; steps: LocalStep[]; operation: string; }

const NEWTON_TO_LOCAL_OP: Record<string, string> = {
  simplify: "simplify",
  factor: "factor",
  derive: "diff",
  integrate: "integrate",
  zeroes: "solve",
  expand: "expand",
};

export default function ExternalSolverTab() {
  const { deductToken, isAuthenticated } = useAuth();

  const [expression, setExpression] = useState("");
  const [source, setSource] = useState("newton");
  const [operation, setOperation] = useState("simplify");
  const [result, setResult] = useState<ExternalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [localSteps, setLocalSteps] = useState<LocalComputeResult | null>(null);
  const [localStepsLoading, setLocalStepsLoading] = useState(false);
  const [localStepsError, setLocalStepsError] = useState<string | null>(null);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [aiModel, setAiModel] = useState("qwen/qwen3.5-9b");
  const [aiParagraphs, setAiParagraphs] = useState<AIParagraph[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiParaId = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  const [calcOpen, setCalcOpen] = useState(false);
  const [advancedCalc, setAdvancedCalc] = useState(false);
  const exprRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (value: string) => {
    const el = exprRef.current;
    if (!el) { setExpression((q) => q + value); return; }
    const start = el.selectionStart ?? expression.length;
    const end = el.selectionEnd ?? expression.length;
    const next = expression.slice(0, start) + value + expression.slice(end);
    setExpression(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const handleCalcKey = (key: string) => {
    if (!key) return;
    if (key === "⌫") {
      const el = exprRef.current;
      const pos = el?.selectionStart ?? expression.length;
      if (pos > 0) {
        setExpression((q) => q.slice(0, pos - 1) + q.slice(pos));
        requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos - 1, pos - 1); });
      }
      return;
    }
    if (key === "⌦") { setExpression(""); exprRef.current?.focus(); return; }
    insertAtCursor(KEY_MAP[key] ?? key);
  };

  useEffect(() => () => { esRef.current?.close(); }, []);

  const streamAiExplanation = (expr: string, apiResult: string, op?: string, steps?: boolean) => {
    esRef.current?.close();
    setAiParagraphs([]);
    setAiError(null);
    setAiLoading(true);

    const question = op
      ? `${op} of (${expr}) = ${apiResult}`
      : `Expression: ${expr} = ${apiResult}`;

    const prompt = steps
      ? `Show me the complete step-by-step working to solve this from scratch, with every step clearly numbered and explained: ${question}`
      : `Explain this result step by step: ${question}`;

    const params = new URLSearchParams({
      question: prompt,
      ai: aiModel,
      topic: "explain result",
    });

    const streamBase = isFreeAiModel(aiModel) ? "/api/free-ai/solve-stream" : "/api/solve-stream";
    const es = new EventSource(`${streamBase}?${params.toString()}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as { paragraph?: string; done?: boolean; error?: string };
        if (d.error) { setAiError(d.error); setAiLoading(false); es.close(); return; }
        if (d.paragraph) {
          const id = ++aiParaId.current;
          setAiParagraphs((prev) => [...prev, { text: d.paragraph!, id }]);
        }
        if (d.done) { setAiLoading(false); es.close(); }
      } catch {}
    };

    es.onerror = () => {
      setAiError("AI stream disconnected.");
      setAiLoading(false);
      es.close();
    };
  };

  const fetchLocalSteps = async (expr: string, op: string) => {
    const localOp = NEWTON_TO_LOCAL_OP[op];
    if (!localOp) return;
    setLocalStepsLoading(true);
    setLocalSteps(null);
    setLocalStepsError(null);
    try {
      const res = await fetch("/api/math/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ expression: expr, operation: localOp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Computation failed");
      setLocalSteps(data as LocalComputeResult);
    } catch (err) {
      setLocalStepsError((err as Error).message);
    } finally {
      setLocalStepsLoading(false);
    }
  };

  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!result) return;
    const appUrl = `${window.location.origin}${window.location.pathname}`;
    const text = `🧮 I solved "${result.expression || expression}" = ${result.result} using ZimSolve!\n\nTry it free: ${appUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "ZimSolve Result", text, url: appUrl });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }, [result, expression]);

  const handleCompute = async () => {
    if (!expression.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setAiParagraphs([]);
    setAiError(null);
    setLocalSteps(null);
    setLocalStepsError(null);

    if (isAuthenticated) await deductToken();

    try {
      const params = new URLSearchParams({ source, expression });
      if (source === "newton") params.set("operation", operation);
      const res = await fetch(`/api/external-solve?${params.toString()}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "External API failed");

      const r = data as ExternalResult;
      setResult(r);
      logActivity("external_solve", `${r.operation || source}: ${expression.slice(0, 80)}`, 10);

      if (showSteps && source === "newton") {
        fetchLocalSteps(expression, operation);
      }

      if (aiEnabled) {
        streamAiExplanation(expression, r.result, r.operation, false);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <Card>
        <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-teal-500/20 text-teal-400">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-foreground">Mathematics Solver Hub</h2>
              <p className="text-sm text-muted-foreground">
                {showSteps ? "Newton API answer + full step-by-step working (no AI)" : aiEnabled ? "API result + AI explanation" : "Free open-source math APIs — no AI required"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCalcOpen(v => !v)}
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
              onClick={() => setShowSteps(v => !v)}
              title={showSteps ? "Disable step-by-step working" : "Show step-by-step working (no AI)"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                showSteps
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
              )}
            >
              <FlaskConical className="w-4 h-4" />
              <span className="hidden sm:inline">{showSteps ? "Steps On" : "Steps"}</span>
            </button>
            <button
              onClick={() => setAiEnabled((v) => !v)}
              title={aiEnabled ? "Switch to API-only mode" : "Add AI explanation"}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <AnimatePresence>
            {aiEnabled && (
              <motion.div
                key="ai-model-select"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Label htmlFor="extAiModel">AI Model</Label>
                <select
                  id="extAiModel"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="w-full h-10 rounded-xl px-3 text-sm bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary/50 transition-colors"
                >
                  <optgroup label="— Free (always available) —">
                    {FREE_AI_MODELS.map(m => (
                      <option key={m.value} value={m.value} style={{ background: "#1a1f2e" }}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="— Premium (token balance required) —">
                    {(isAuthenticated ? PREMIUM_AI_MODELS : PREMIUM_AI_MODELS.filter(m => m.value === "qwen/qwen3.5-9b")).map(m => (
                      <option key={m.value} value={m.value} style={{ background: "#1a1f2e" }}>{m.label}</option>
                    ))}
                  </optgroup>
                </select>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <Label htmlFor="sourceSelect">Source API</Label>
            <Select
              id="sourceSelect"
              value={source}
              onChange={(e) => { setSource(e.target.value); setResult(null); setError(null); setAiParagraphs([]); }}
              options={SOURCES}
            />
          </div>

          {source === "newton" && (
            <div>
              <Label htmlFor="opSelect">Operation</Label>
              <Select
                id="opSelect"
                value={operation}
                onChange={(e) => setOperation(e.target.value)}
                options={NEWTON_OPS}
              />
            </div>
          )}
        </div>

        {SOURCE_NOTES[source] && (
          <p className="text-xs text-muted-foreground mb-4 pl-1">
            <span className="text-teal-400 font-semibold">ℹ </span>{SOURCE_NOTES[source]}
          </p>
        )}

        <div className="mb-4">
          <Label htmlFor="extExpr">Expression</Label>
          <Textarea
            ref={exprRef}
            id="extExpr"
            placeholder={
              source === "newton"
                ? operation === "tangent" ? "e.g. 2|x^3 (format: point|expression)" :
                  operation === "area"    ? "e.g. 2:4|x^3 (format: from:to|expression)" :
                  "e.g. x^2 + 9x + 20"
                : "e.g. sqrt(144) + 2^10"
            }
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCompute(); }}
            className="text-lg font-mono"
          />
          {source === "newton" && (
            <p className="text-xs text-muted-foreground mt-1">
              Tangent: <code className="text-teal-300">point|expression</code> ·
              Area: <code className="text-teal-300">from:to|expression</code> ·
              Ctrl+Enter to compute
            </p>
          )}
        </div>

        {/* ── Calculator Keypad ── */}
        <AnimatePresence>
          {calcOpen && (
            <motion.div
              key="ext-calculator"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-4"
            >
              <div className="rounded-xl border border-indigo-500/20 overflow-hidden" style={{ background: "rgba(99,102,241,0.04)" }}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-500/15" style={{ background: "rgba(99,102,241,0.08)" }}>
                  <p className="text-xs text-indigo-300 font-semibold uppercase tracking-wider">Math Keypad</p>
                  <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <button onClick={() => setAdvancedCalc(false)}
                      className={cn("px-3 py-1 rounded-md text-xs font-semibold transition-all", !advancedCalc ? "bg-indigo-500/40 text-indigo-200" : "text-muted-foreground hover:text-white")}>
                      Basic
                    </button>
                    <button onClick={() => setAdvancedCalc(true)}
                      className={cn("px-3 py-1 rounded-md text-xs font-semibold transition-all", advancedCalc ? "bg-indigo-500/40 text-indigo-200" : "text-muted-foreground hover:text-white")}>
                      Advanced
                    </button>
                  </div>
                </div>

                {!advancedCalc ? (
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
                            return isEmpty ? <span key={i} /> : (
                              <button key={i} onClick={() => handleCalcKey(key)}
                                className={cn(
                                  "py-1.5 rounded-md font-mono font-semibold transition-all active:scale-95 text-center leading-none",
                                  key.length > 4 ? "text-[10px]" : key.length > 2 ? "text-xs" : "text-sm",
                                  isDelete ? "bg-orange-500/25 text-orange-300 hover:bg-orange-500/35 border border-orange-500/40" :
                                  isClear  ? "bg-red-500/25 text-red-300 hover:bg-red-500/35 border border-red-500/40" :
                                             cn("hover:bg-white/15 border border-white/10 hover:border-white/25", section.color)
                                )}
                                title={KEY_MAP[key] ? `Inserts: ${KEY_MAP[key]}` : key}>
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

        <Button
          onClick={handleCompute}
          disabled={loading || !expression.trim()}
          className="w-full sm:w-auto"
        >
          {loading ? (
            <><span className="mr-2">Computing</span><span className="animate-pulse">…</span></>
          ) : (
            <>
              <Calculator className="w-4 h-4 mr-2" />
              Compute via {source === "newton" ? "Newton API" : "api.mathjs.org"}
              {aiEnabled && <><span className="mx-1">+</span><Sparkles className="w-3.5 h-3.5" /></>}
            </>
          )}
        </Button>

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </Card>

      <AnimatePresence>
        {result && (
          <motion.div
            key="ext-result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <Card className="border-t-4 border-t-teal-500">
              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/10">
                <div className="p-3 rounded-xl bg-teal-500/20 text-teal-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-display font-bold text-foreground">Result</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {result.source === "newton" ? `Newton API · ${result.operation ?? operation}` : "api.mathjs.org"}
                  </p>
                </div>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: copied ? "rgba(16,185,129,0.15)" : "rgba(20,184,166,0.1)",
                    border: copied ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(20,184,166,0.25)",
                    color: copied ? "#34d399" : "#2dd4bf",
                  }}
                  title="Share result"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Share"}
                </button>
              </div>

              <div className="space-y-4">
                {result.expression && (
                  <div>
                    <Label>Expression (normalised)</Label>
                    <Input readOnly value={result.expression}
                      className="font-mono text-slate-300 border-white/10 bg-black/20" />
                  </div>
                )}
                <div>
                  <Label>Answer</Label>
                  <Input readOnly value={result.result}
                    className="font-mono text-lg text-teal-400 border-teal-500/30 bg-teal-500/5 focus-visible:border-teal-500/30" />
                </div>
              </div>
            </Card>

            {showSteps && (localSteps || localStepsLoading || localStepsError) && (
              <Card className="border-t-4 border-t-emerald-500">
                <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/10">
                  <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <FlaskConical className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-bold text-foreground">Step-by-Step Working</h2>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Computed locally · no AI used</p>
                  </div>
                </div>

                {localStepsLoading && (
                  <div className="flex gap-1 py-2">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                )}

                {localStepsError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Could not compute steps for this expression: {localStepsError}</span>
                  </div>
                )}

                {localSteps && localSteps.steps.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider pb-1">
                      {localSteps.steps.length} steps · {localSteps.operation}
                    </p>
                    {localSteps.steps.map((s, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, type: "spring", stiffness: 260, damping: 24 }}
                        className="flex gap-0 rounded-xl overflow-hidden"
                        style={{ border: "1px solid rgba(16,185,129,0.18)" }}
                      >
                        {/* Colored left border stripe */}
                        <div className="w-1 shrink-0" style={{ background: `hsl(${160 - i * 12},70%,50%)` }} />
                        <div className="flex gap-3 p-3.5 flex-1 min-w-0" style={{ background: "rgba(16,185,129,0.04)" }}>
                          {/* Step number badge */}
                          <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold mt-0.5"
                            style={{ background: `hsl(${160 - i * 12},70%,18%)`, border: `1px solid hsl(${160 - i * 12},60%,35%)`, color: `hsl(${160 - i * 12},80%,65%)` }}>
                            {s.step}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="text-slate-200 text-sm font-semibold leading-snug">{s.label}</p>
                            {s.expression && (
                              <div className="rounded-lg px-3 py-2"
                                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(16,185,129,0.2)" }}>
                                <code className="text-emerald-300 font-mono text-[13px] break-all">{s.expression}</code>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {/* Final answer highlight */}
                    <div className="mt-1 rounded-xl px-4 py-3 flex items-center gap-3"
                      style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider shrink-0">Result</span>
                      <code className="font-mono text-emerald-300 text-sm break-all">{localSteps.result}</code>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {aiEnabled && (aiParagraphs.length > 0 || aiLoading || aiError) && (
              <Card className="border-t-4 border-t-blue-500">
                <div className="flex items-center gap-4 mb-6 pb-4 border-b border-white/10">
                  <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-bold text-foreground">AI Explanation</h2>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{aiModel}</p>
                  </div>
                </div>

                {aiError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{aiError}</span>
                  </div>
                )}

                <div className="space-y-4 prose prose-invert max-w-none">
                  {aiParagraphs.map((p) => (
                    <motion.p
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-foreground/90 leading-relaxed"
                    >
                      {p.text}
                    </motion.p>
                  ))}
                  {aiLoading && (
                    <div className="flex gap-1 pt-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ExternalSolverGuide />
    </motion.div>
  );
}
