import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { evaluate, pi, e as mathE } from "mathjs";
import { Calculator, RefreshCw, History, Sigma, Ruler, Delete, ChevronDown } from "lucide-react";

type CalcTab = "scientific" | "converter" | "statistics" | "history";
type AngleMode = "DEG" | "RAD";

interface HistEntry { expr: string; result: string; ts: number; }

const CONVERTER_CATEGORIES = [
  {
    id: "length", label: "Length",
    units: ["mm","cm","m","km","in","ft","yd","mi","nm","μm"],
    toBase: { mm:0.001, cm:0.01, m:1, km:1000, in:0.0254, ft:0.3048, yd:0.9144, mi:1609.344, nm:1e-9, "μm":1e-6 },
  },
  {
    id: "mass", label: "Mass",
    units: ["mg","g","kg","t","oz","lb","st"],
    toBase: { mg:1e-6, g:0.001, kg:1, t:1000, oz:0.0283495, lb:0.453592, st:6.35029 },
  },
  {
    id: "temperature", label: "Temperature",
    units: ["°C","°F","K"],
    toBase: null,
  },
  {
    id: "area", label: "Area",
    units: ["mm²","cm²","m²","km²","in²","ft²","ac","ha"],
    toBase: { "mm²":1e-6,"cm²":1e-4,"m²":1,"km²":1e6,"in²":6.4516e-4,"ft²":0.092903,"ac":4046.86,"ha":10000 },
  },
  {
    id: "volume", label: "Volume",
    units: ["mL","L","m³","fl oz","cup","pt","qt","gal"],
    toBase: { mL:0.001, L:1, "m³":1000, "fl oz":0.0295735, cup:0.236588, pt:0.473176, qt:0.946353, gal:3.78541 },
  },
  {
    id: "speed", label: "Speed",
    units: ["m/s","km/h","mph","knot","ft/s"],
    toBase: { "m/s":1, "km/h":1/3.6, mph:0.44704, knot:0.514444, "ft/s":0.3048 },
  },
  {
    id: "time", label: "Time",
    units: ["ms","s","min","h","day","wk","mo","yr"],
    toBase: { ms:0.001, s:1, min:60, h:3600, day:86400, wk:604800, mo:2628000, yr:31536000 },
  },
  {
    id: "digital", label: "Digital Storage",
    units: ["bit","B","KB","MB","GB","TB"],
    toBase: { bit:0.125, B:1, KB:1024, MB:1048576, GB:1073741824, TB:1099511627776 },
  },
];

function convertTemp(val: number, from: string, to: string): number {
  if (from === to) return val;
  let celsius = from === "°C" ? val : from === "°F" ? (val - 32) * 5/9 : val - 273.15;
  if (to === "°C") return celsius;
  if (to === "°F") return celsius * 9/5 + 32;
  return celsius + 273.15;
}

function convertUnit(val: number, from: string, to: string, cat: typeof CONVERTER_CATEGORIES[0]): number {
  if (cat.id === "temperature") return convertTemp(val, from, to);
  const tb = cat.toBase as unknown as Record<string, number>;
  return (val * (tb[from] ?? 1)) / (tb[to] ?? 1);
}

function statsOf(nums: number[]) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a,b) => a-b);
  const n = nums.length;
  const sum = nums.reduce((a,b) => a+b, 0);
  const mean = sum / n;
  const median = n % 2 === 0 ? (sorted[n/2-1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
  const variance = nums.reduce((a,x) => a + (x - mean)**2, 0) / n;
  const stddev = Math.sqrt(variance);
  const freqMap: Record<number,number> = {};
  nums.forEach(x => { freqMap[x] = (freqMap[x] ?? 0) + 1; });
  const maxFreq = Math.max(...Object.values(freqMap));
  const mode = maxFreq > 1 ? Object.entries(freqMap).filter(([,f]) => f === maxFreq).map(([v]) => Number(v)) : [];
  return { n, sum, mean, median, mode, variance, stddev, min: sorted[0], max: sorted[n-1], range: sorted[n-1] - sorted[0] };
}

function fmtNum(n: number): string {
  if (isNaN(n) || !isFinite(n)) return String(n);
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential(6);
  const s = parseFloat(n.toPrecision(12)).toString();
  return s;
}

export default function CalculatorTab() {
  const [activeTab, setActiveTab] = useState<CalcTab>("scientific");
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("0");
  const [isResult, setIsResult] = useState(false);
  const [angleMode, setAngleMode] = useState<AngleMode>("DEG");
  const [memory, setMemory] = useState<number | null>(null);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [convCat, setConvCat] = useState(CONVERTER_CATEGORIES[0]);
  const [convFrom, setConvFrom] = useState(CONVERTER_CATEGORIES[0].units[0]);
  const [convTo, setConvTo] = useState(CONVERTER_CATEGORIES[0].units[1]);
  const [convVal, setConvVal] = useState("");
  const [convResult, setConvResult] = useState<string | null>(null);

  const [statInput, setStatInput] = useState("");
  const [statResult, setStatResult] = useState<ReturnType<typeof statsOf>>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const toRad = useCallback((x: number) => angleMode === "DEG" ? x * Math.PI / 180 : x, [angleMode]);
  const fromRad = useCallback((x: number) => angleMode === "DEG" ? x * 180 / Math.PI : x, [angleMode]);

  const compute = useCallback((e: string): string => {
    try {
      let processed = e
        .replace(/π/g, `(${pi})`)
        .replace(/\be\b/g, `(${mathE})`)
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/−/g, "-");

      if (angleMode === "DEG") {
        processed = processed
          .replace(/\bsin\(/g, `sin(${pi}/180*`)
          .replace(/\bcos\(/g, `cos(${pi}/180*`)
          .replace(/\btan\(/g, `tan(${pi}/180*`)
          .replace(/\bsinh\(/g, "sinh(")
          .replace(/\bcosh\(/g, "cosh(")
          .replace(/\btanh\(/g, "tanh(")
          .replace(/\basin\(/g, `(180/${pi})*asin(`)
          .replace(/\bacos\(/g, `(180/${pi})*acos(`)
          .replace(/\batan\(/g, `(180/${pi})*atan(`);
      }

      const res = evaluate(processed);
      return fmtNum(typeof res === "number" ? res : Number(res));
    } catch {
      return "Error";
    }
  }, [angleMode]);

  const pushHistory = useCallback((e: string, r: string) => {
    setHistory(prev => [{ expr: e, result: r, ts: Date.now() }, ...prev.slice(0, 49)]);
  }, []);

  const handleEquals = useCallback(() => {
    const e = expr || display;
    if (!e || e === "0") return;
    const r = compute(e);
    pushHistory(e, r);
    setDisplay(r);
    setExpr("");
    setIsResult(true);
  }, [expr, display, compute, pushHistory]);

  const append = useCallback((s: string) => {
    if (isResult && /^[\d.π]$/.test(s)) {
      setExpr(s); setDisplay(s); setIsResult(false);
    } else {
      const next = (isResult ? "" : expr) + s;
      setExpr(next); setDisplay(next || "0"); setIsResult(false);
    }
  }, [isResult, expr]);

  const handleKey = useCallback((k: string) => {
    switch (k) {
      case "C": setExpr(""); setDisplay("0"); setIsResult(false); break;
      case "⌫": {
        const next = expr.slice(0, -1);
        setExpr(next); setDisplay(next || "0"); setIsResult(false);
        break;
      }
      case "=": handleEquals(); break;
      case "MC": setMemory(null); break;
      case "MR": if (memory !== null) { const s = fmtNum(memory); setExpr(s); setDisplay(s); setIsResult(false); } break;
      case "M+": { const v = parseFloat(compute(expr || display)); if (!isNaN(v)) setMemory((memory ?? 0) + v); break; }
      case "M-": { const v = parseFloat(compute(expr || display)); if (!isNaN(v)) setMemory((memory ?? 0) - v); break; }
      case "+/-": {
        const cur = expr || display;
        const toggled = cur.startsWith("-") ? cur.slice(1) : "-" + cur;
        setExpr(toggled); setDisplay(toggled); break;
      }
      case "%": {
        try {
          const v = parseFloat(compute(expr || display)) / 100;
          const s = fmtNum(v); setExpr(s); setDisplay(s); setIsResult(true);
        } catch {}
        break;
      }
      case "x²": {
        if (expr && !isResult) { append("^2"); }
        else { const v = parseFloat(isResult ? display : (display === "0" ? "" : display)); if (!isNaN(v)) { const s = fmtNum(v * v); setExpr(s); setDisplay(s); setIsResult(true); } }
        break;
      }
      case "x³": {
        if (expr && !isResult) { append("^3"); }
        else { const v = parseFloat(isResult ? display : (display === "0" ? "" : display)); if (!isNaN(v)) { const s = fmtNum(v * v * v); setExpr(s); setDisplay(s); setIsResult(true); } }
        break;
      }
      case "xⁿ": {
        if (expr && !isResult) { append("^"); }
        break;
      }
      case "√x": {
        if (expr && !isResult) { append("sqrt("); }
        else { const v = parseFloat(isResult ? display : (display === "0" ? "" : display)); if (!isNaN(v) && v >= 0) { const s = fmtNum(Math.sqrt(v)); setExpr(s); setDisplay(s); setIsResult(true); } }
        break;
      }
      case "∛x": {
        if (expr && !isResult) { append("cbrt("); }
        else { const v = parseFloat(isResult ? display : (display === "0" ? "" : display)); if (!isNaN(v)) { const s = fmtNum(Math.cbrt(v)); setExpr(s); setDisplay(s); setIsResult(true); } }
        break;
      }
      case "1/x": {
        const v = parseFloat(compute(expr || display));
        if (v !== 0) { const s = fmtNum(1/v); setExpr(s); setDisplay(s); setIsResult(true); }
        break;
      }
      case "n!": {
        const v = parseInt(compute(expr || display));
        if (!isNaN(v) && v >= 0 && v <= 20) {
          let f = 1; for (let i = 2; i <= v; i++) f *= i;
          const s = String(f); setExpr(s); setDisplay(s); setIsResult(true);
        }
        break;
      }
      case "log": append("log10("); break;
      case "ln": append("log("); break;
      case "log₂": append("log2("); break;
      case "10ˣ": append("10^"); break;
      case "eˣ": append("exp("); break;
      case "sin": append("sin("); break;
      case "cos": append("cos("); break;
      case "tan": append("tan("); break;
      case "sin⁻¹": append("asin("); break;
      case "cos⁻¹": append("acos("); break;
      case "tan⁻¹": append("atan("); break;
      case "sinh": {
        if (isResult || !expr) { const v = parseFloat(display); if (!isNaN(v)) { const s = fmtNum(Math.sinh(v)); setExpr(s); setDisplay(s); setIsResult(true); } }
        else append("sinh(");
        break;
      }
      case "cosh": {
        if (isResult || !expr) { const v = parseFloat(display); if (!isNaN(v)) { const s = fmtNum(Math.cosh(v)); setExpr(s); setDisplay(s); setIsResult(true); } }
        else append("cosh(");
        break;
      }
      case "tanh": {
        if (isResult || !expr) { const v = parseFloat(display); if (!isNaN(v)) { const s = fmtNum(Math.tanh(v)); setExpr(s); setDisplay(s); setIsResult(true); } }
        else append("tanh(");
        break;
      }
      case "π": append("π"); break;
      case "e": append("e"); break;
      case "φ": append(`${((1 + Math.sqrt(5)) / 2)}`); break;
      case "Ans": {
        if (history.length > 0) {
          const v = history[0].result;
          setExpr(v); setDisplay(v); setIsResult(false);
        }
        break;
      }
      default: append(k); break;
    }
  }, [expr, display, compute, append, handleEquals, memory, history]);

  const handleKeyboard = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleEquals();
    else if (e.key === "Backspace") handleKey("⌫");
    else if (e.key === "Escape") handleKey("C");
  }, [handleEquals, handleKey]);

  const btnCls = (color = "default") => cn(
    "h-12 md:h-11 rounded-xl text-sm font-semibold transition-all active:scale-95 select-none",
    color === "orange" && "text-orange-300",
    color === "violet" && "text-violet-300",
    color === "green" && "text-emerald-300",
    color === "red" && "text-red-300",
    color === "blue" && "text-blue-300",
    color === "default" && "text-white",
  );
  const btnStyle = (color = "default") => ({
    background: color === "orange" ? "rgba(251,146,60,0.15)" : color === "violet" ? "rgba(139,92,246,0.18)" :
      color === "green" ? "rgba(16,185,129,0.15)" : color === "red" ? "rgba(239,68,68,0.15)" :
      color === "blue" ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.06)",
    border: color === "orange" ? "1px solid rgba(251,146,60,0.3)" : color === "violet" ? "1px solid rgba(139,92,246,0.3)" :
      color === "green" ? "1px solid rgba(16,185,129,0.25)" : color === "red" ? "1px solid rgba(239,68,68,0.25)" :
      color === "blue" ? "1px solid rgba(96,165,250,0.25)" : "1px solid rgba(255,255,255,0.08)",
  });

  const Btn = ({ k, color, wide }: { k: string; color?: string; wide?: boolean }) => (
    <button onClick={() => handleKey(k)} className={cn(btnCls(color), wide && "col-span-2")} style={btnStyle(color)}>
      {k}
    </button>
  );

  const tabs: { id: CalcTab; label: string; icon: React.ElementType }[] = [
    { id: "scientific", label: "Scientific", icon: Calculator },
    { id: "converter", label: "Converter", icon: Ruler },
    { id: "statistics", label: "Statistics", icon: Sigma },
    { id: "history", label: "History", icon: History },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="space-y-4 max-w-3xl mx-auto">

      <div className="flex items-center gap-3 px-1">
        <div className="p-2.5 rounded-xl" style={{ background: "rgba(249,115,22,0.18)", border: "1px solid rgba(249,115,22,0.3)" }}>
          <Calculator className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h2 className="text-lg font-display font-black text-white">Advanced Calculator</h2>
          <p className="text-xs text-muted-foreground">Scientific · Unit Converter · Statistics</p>
        </div>
      </div>

      <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all",
              activeTab === t.id ? "text-white" : "text-muted-foreground hover:text-white/70")}
            style={activeTab === t.id ? { background: "rgba(249,115,22,0.25)", border: "1px solid rgba(249,115,22,0.4)" } : {}}>
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "scientific" && (
          <motion.div key="sci" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(14,17,35,0.85)", border: "1px solid rgba(255,255,255,0.09)" }}>

            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => setAngleMode(m => m === "DEG" ? "RAD" : "DEG")}
                className={cn("px-3 py-1 rounded-lg text-xs font-bold transition-all")}
                style={{ background: angleMode === "DEG" ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
                {angleMode}
              </button>
              {memory !== null && (
                <span className="px-2 py-1 rounded-lg text-xs font-semibold text-amber-300" style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  M: {fmtNum(memory)}
                </span>
              )}
            </div>

            <div className="rounded-xl p-4 min-h-[80px] flex flex-col justify-end text-right"
              style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-sm text-muted-foreground truncate">{expr || ""}</p>
              <input ref={inputRef} value={display} readOnly onKeyDown={handleKeyboard}
                className="bg-transparent text-right text-3xl font-mono font-black text-white focus:outline-none w-full" />
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              <Btn k="MC" color="blue" /><Btn k="MR" color="blue" /><Btn k="M+" color="blue" /><Btn k="M-" color="blue" /><Btn k="Ans" color="blue" />
              <Btn k="sin" color="violet" /><Btn k="cos" color="violet" /><Btn k="tan" color="violet" /><Btn k="sin⁻¹" color="violet" /><Btn k="cos⁻¹" color="violet" />
              <Btn k="tan⁻¹" color="violet" /><Btn k="sinh" color="violet" /><Btn k="cosh" color="violet" /><Btn k="tanh" color="violet" /><Btn k="abs(" color="violet" />
              <Btn k="log" color="green" /><Btn k="ln" color="green" /><Btn k="log₂" color="green" /><Btn k="10ˣ" color="green" /><Btn k="eˣ" color="green" />
              <Btn k="x²" color="orange" /><Btn k="x³" color="orange" /><Btn k="xⁿ" color="orange" /><Btn k="√x" color="orange" /><Btn k="∛x" color="orange" />
              <Btn k="1/x" color="orange" /><Btn k="n!" color="orange" /><Btn k="π" color="green" /><Btn k="e" color="green" /><Btn k="φ" color="green" />
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <Btn k="C" color="red" /><Btn k="+/-" /><Btn k="%" /><Btn k="÷" color="orange" />
              <Btn k="7" /><Btn k="8" /><Btn k="9" /><Btn k="×" color="orange" />
              <Btn k="4" /><Btn k="5" /><Btn k="6" /><Btn k="-" color="orange" />
              <Btn k="1" /><Btn k="2" /><Btn k="3" /><Btn k="+" color="orange" />
              <Btn k="0" wide /><Btn k="." /><Btn k="⌫" color="red" />
              <Btn k="(" /><Btn k=")" /><button onClick={handleEquals} className={cn(btnCls("violet"), "col-span-2")} style={btnStyle("violet")}>=</button>
            </div>
          </motion.div>
        )}

        {activeTab === "converter" && (
          <motion.div key="conv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(14,17,35,0.85)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <h3 className="text-sm font-bold text-white">Unit Converter</h3>

            <div>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Category</p>
              <div className="flex flex-wrap gap-1.5">
                {CONVERTER_CATEGORIES.map(c => (
                  <button key={c.id} onClick={() => { setConvCat(c); setConvFrom(c.units[0]); setConvTo(c.units[1]); setConvResult(null); }}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                      convCat.id === c.id ? "text-white" : "text-muted-foreground hover:text-white/80")}
                    style={convCat.id === c.id ? { background: "rgba(249,115,22,0.2)", borderColor: "rgba(249,115,22,0.4)" } : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">From</p>
                <select value={convFrom} onChange={e => setConvFrom(e.target.value)} className="w-full px-3 py-2 rounded-xl text-white text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {convCat.units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">To</p>
                <select value={convTo} onChange={e => setConvTo(e.target.value)} className="w-full px-3 py-2 rounded-xl text-white text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {convCat.units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Value ({convFrom})</p>
              <input type="number" value={convVal} onChange={e => setConvVal(e.target.value)}
                placeholder="Enter value…"
                className="w-full px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
            </div>

            <button onClick={() => {
              const v = parseFloat(convVal);
              if (isNaN(v)) return;
              const r = convertUnit(v, convFrom, convTo, convCat);
              setConvResult(`${fmtNum(v)} ${convFrom} = ${fmtNum(r)} ${convTo}`);
            }} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.4), rgba(239,68,68,0.3))", border: "1px solid rgba(249,115,22,0.5)" }}>
              Convert
            </button>

            {convResult && (
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)" }}>
                <p className="text-lg font-black text-orange-300">{convResult}</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "statistics" && (
          <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(14,17,35,0.85)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <h3 className="text-sm font-bold text-white">Statistics Calculator</h3>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Data set (comma or space separated)</p>
              <textarea value={statInput} onChange={e => setStatInput(e.target.value)} rows={3}
                placeholder="e.g.  4, 7, 13, 2, 1, 9, 7, 13, 3"
                className="w-full px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
            </div>
            <button onClick={() => {
              const nums = statInput.split(/[\s,]+/).map(Number).filter(n => !isNaN(n) && n.toString() !== "");
              setStatResult(statsOf(nums));
            }} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.4), rgba(6,95,70,0.3))", border: "1px solid rgba(16,185,129,0.5)" }}>
              Calculate
            </button>
            {statResult && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Count (n)", statResult.n],
                  ["Sum", fmtNum(statResult.sum)],
                  ["Mean (μ)", fmtNum(statResult.mean)],
                  ["Median", fmtNum(statResult.median)],
                  ["Mode", statResult.mode.length > 0 ? statResult.mode.map(fmtNum).join(", ") : "No mode"],
                  ["Std Dev (σ)", fmtNum(statResult.stddev)],
                  ["Variance (σ²)", fmtNum(statResult.variance)],
                  ["Min", fmtNum(statResult.min)],
                  ["Max", fmtNum(statResult.max)],
                  ["Range", fmtNum(statResult.range)],
                ].map(([label, val]) => (
                  <div key={label as string} className="rounded-xl p-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)" }}>
                    <p className="text-[10px] text-emerald-400/70 font-semibold uppercase tracking-wider">{label}</p>
                    <p className="text-white font-mono font-bold mt-0.5 text-sm">{val}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "history" && (
          <motion.div key="hist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(14,17,35,0.85)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Calculation History</h3>
              {history.length > 0 && (
                <button onClick={() => setHistory([])} className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No calculations yet. Use the Scientific tab to start.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {history.map((h, i) => (
                  <button key={i} onClick={() => { setActiveTab("scientific"); setExpr(h.result); setDisplay(h.result); setIsResult(true); }}
                    className="w-full rounded-xl p-3 text-left transition-all hover:bg-white/5"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs text-muted-foreground font-mono truncate">{h.expr}</p>
                    <p className="text-sm font-mono font-bold text-white">= {h.result}</p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
