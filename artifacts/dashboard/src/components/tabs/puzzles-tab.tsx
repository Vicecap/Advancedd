import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Puzzle, RefreshCw, Trophy, Clock, Star, CheckCircle2, XCircle, Lightbulb, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
function secureRandom(): number {
  const a = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(a);
  return a[0] / 0xffffffff;
}
function randomInt(max: number): number { return Math.floor(secureRandom() * max); }


const BASE_URL_PUZ = import.meta.env.BASE_URL ?? "/";
function apiPuz(p: string) { return `${BASE_URL_PUZ}api${p}`; }
function logGame(gameName: string, detail?: string) {
  fetch(apiPuz("/activity"), {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "game_played", description: `${gameName}${detail ? " — " + detail : ""}`, xpEarned: 5 }),
  }).catch(() => {});
}

// ── Word banks ──────────────────────────────────────────────────────────────

const MATH_WORDS = [
  "ALGEBRA", "CALCULUS", "VECTOR", "MATRIX", "FACTOR", "COSINE", "SINUS", "PRIME",
  "ANGLE", "RATIO", "GRAPH", "PROOF", "AXIOM", "LIMIT", "DELTA", "SIGMA",
  "THETA", "OMEGA", "RADIUS", "CIRCLE", "SQUARE", "PRISM", "CHORD", "TANGENT",
  "DECIMAL", "FRACTION", "EQUATION", "POLYGON", "VERTEX", "MEDIAN", "RANGE",
  "GRADIENT", "INTEGRAL", "DERIVE", "DOMAIN", "BINARY", "DIGIT", "POWER",
  "MODULO", "SCALAR", "TENSOR", "COMPLEX", "REAL", "INTEGER", "NATURAL",
  "PARALLEL", "PERPENDICULAR", "HYPOTENUSE", "QUADRANT", "VOLUME", "AREA",
];

const GENERAL_WORDS = [
  "AFRICA", "EUROPE", "AMAZON", "PACIFIC", "OCEAN", "DESERT", "FOREST", "ISLAND",
  "CLIMATE", "VOLCANO", "TECTONIC", "GRAVITY", "PHOTON", "ELECTRON", "NUCLEUS",
  "OXYGEN", "CARBON", "NITROGEN", "HYDROGEN", "PROTEIN", "ENZYME", "HORMONE",
  "HISTORY", "CULTURE", "SOCIETY", "JUSTICE", "FREEDOM", "ECONOMY", "POLITICS",
  "REPUBLIC", "MONARCHY", "DEMOCRACY", "NATION", "CAPITAL", "CENSUS", "MIGRATION",
  "BIOLOGY", "CHEMISTRY", "PHYSICS", "GEOLOGY", "ECOLOGY", "BOTANY", "ANATOMY",
  "PLANET", "GALAXY", "COMET", "NEBULA", "ORBIT", "SOLAR", "LUNAR", "STELLAR",
  "CONTINENT", "MOUNTAIN", "RIVER", "GLACIER", "TUNDRA", "SAVANNA", "WETLAND",
  "TRADE", "EXPORT", "IMPORT", "MARKET", "SUPPLY", "DEMAND", "INFLATION",
];

type Difficulty = "easy" | "medium" | "hard";
type WordBank = "math" | "general";

const DIFFICULTY_CONFIG: Record<Difficulty, { gridSize: number; wordCount: number; dirs: number[][]; label: string; cellPx: number }> = {
  easy:   { gridSize: 9,  wordCount: 6,  dirs: [[0,1],[1,0]],                                             label: "Easy",   cellPx: 30 },
  medium: { gridSize: 12, wordCount: 8,  dirs: [[0,1],[1,0],[1,1],[0,-1],[-1,0],[-1,-1],[1,-1],[-1,1]],  label: "Medium", cellPx: 26 },
  hard:   { gridSize: 15, wordCount: 10, dirs: [[0,1],[1,0],[1,1],[0,-1],[-1,0],[-1,-1],[1,-1],[-1,1]],  label: "Hard",   cellPx: 22 },
};

const FILL_PUZZLES: { word: string; hint: string; blanks: number[] }[] = [
  { word: "PYTHAGORAS", hint: "Famous Greek mathematician known for his theorem on right triangles", blanks: [1,3,5,7,9] },
  { word: "QUADRATIC", hint: "Type of equation with degree 2 (ax² + bx + c = 0)", blanks: [0,2,4,6,8] },
  { word: "DIFFERENTIAL", hint: "Branch of calculus dealing with rates of change", blanks: [1,3,5,7,9,11] },
  { word: "TRIGONOMETRY", hint: "Study of relationships between angles and sides of triangles", blanks: [0,2,4,6,8,10] },
  { word: "POLYNOMIAL", hint: "Expression with multiple terms (e.g. 3x² + 2x + 1)", blanks: [1,3,5,7,9] },
  { word: "LOGARITHM", hint: "Inverse of exponentiation — log base 10 of 100 = 2", blanks: [0,2,4,6,8] },
  { word: "CIRCUMFERENCE", hint: "Perimeter of a circle (2πr)", blanks: [1,3,5,7,9,11,12] },
  { word: "PERPENDICULAR", hint: "Lines that meet at exactly 90 degrees", blanks: [0,2,4,6,8,10,12] },
  { word: "DENOMINATOR", hint: "The bottom number in a fraction", blanks: [1,3,5,7,9] },
  { word: "PARABOLA", hint: "U-shaped curve produced by a quadratic function", blanks: [0,2,4,6] },
];

const ANAGRAM_PUZZLES: { word: string; hint: string }[] = [
  { word: "ANGLE", hint: "Measurement between two lines meeting at a point" },
  { word: "PRIME", hint: "A number divisible only by 1 and itself" },
  { word: "RATIO", hint: "Comparison of two quantities" },
  { word: "DELTA", hint: "Greek letter often meaning 'change' in math" },
  { word: "CHORD", hint: "Line segment joining two points on a circle" },
  { word: "SIGMA", hint: "Greek letter used for summation" },
  { word: "PROOF", hint: "Logical demonstration that a statement is true" },
  { word: "RANGE", hint: "Difference between max and min values in a data set" },
  { word: "GRAPH", hint: "Visual representation of mathematical relationships" },
  { word: "LIMIT", hint: "Value a function approaches as input reaches a point" },
  { word: "AXIOM", hint: "A statement accepted as true without proof" },
  { word: "SOLID", hint: "3D geometric shape" },
];

const CROSSWORD_DATA = {
  across: [
    { number: 1, clue: "Opposite of addition", answer: "SUBTRACT", row: 0, col: 0 },
    { number: 3, clue: "A shape with 3 sides", answer: "TRIANGLE", row: 2, col: 0 },
    { number: 5, clue: "2, 3, 5, 7 are examples", answer: "PRIME", row: 4, col: 0 },
  ],
  down: [
    { number: 2, clue: "Product of all integers up to n (n!)", answer: "FACTORIAL", row: 0, col: 3 },
    { number: 4, clue: "Ratio of circumference to diameter", answer: "PI", row: 2, col: 5 },
  ],
};

const MATH_TRIVIA: { q: string; options: string[]; answer: number; explanation: string }[] = [
  { q: "What is the value of π (pi) to 2 decimal places?", options: ["3.12", "3.14", "3.16", "3.18"], answer: 1, explanation: "π ≈ 3.14159… so to 2 d.p. it is 3.14" },
  { q: "What is the sum of angles in a triangle?", options: ["90°", "180°", "270°", "360°"], answer: 1, explanation: "All interior angles of any triangle add up to 180°" },
  { q: "Which of these is NOT a prime number?", options: ["11", "13", "15", "17"], answer: 2, explanation: "15 = 3 × 5, so it is composite, not prime" },
  { q: "What does 'hypotenuse' refer to?", options: ["Shortest side", "Longest side of a right triangle", "Adjacent side", "Opposite side"], answer: 1, explanation: "The hypotenuse is the longest side, opposite the right angle" },
  { q: "What is the formula for the area of a circle?", options: ["2πr", "πr²", "πd", "2πr²"], answer: 1, explanation: "Area = πr² where r is the radius" },
  { q: "What is 7! (7 factorial)?", options: ["49", "720", "5040", "40320"], answer: 2, explanation: "7! = 7×6×5×4×3×2×1 = 5040" },
  { q: "In a right triangle with legs 3 and 4, what is the hypotenuse?", options: ["5", "6", "7", "8"], answer: 0, explanation: "By Pythagoras: √(3²+4²) = √(9+16) = √25 = 5" },
  { q: "What is the gradient of a horizontal line?", options: ["Undefined", "1", "0", "-1"], answer: 2, explanation: "A horizontal line has no rise, so gradient = 0" },
  { q: "How many degrees in a full revolution?", options: ["90°", "180°", "270°", "360°"], answer: 3, explanation: "A full revolution = 360°" },
  { q: "What is the quadratic formula for ax²+bx+c=0?", options: ["x = -b/2a", "x = (-b±√(b²-4ac))/2a", "x = b/2a", "x = -b/a"], answer: 1, explanation: "The quadratic formula is x = (-b ± √(b²-4ac)) / 2a" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[]): T { return arr[randomInt(arr.length)]; }

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const reset = () => setSeconds(0);
  const fmt = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return { seconds, fmt, reset };
}

// ── Game 1: Word Search ──────────────────────────────────────────────────────

function buildGrid(words: string[], gridSize: number, dirs: number[][]): { grid: string[][]; placed: { word: string; cells: [number, number][] }[] } {
  const grid: string[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(""));
  const placed: { word: string; cells: [number, number][] }[] = [];

  for (const word of words) {
    let attempts = 0;
    while (attempts < 150) {
      attempts++;
      const [dr, dc] = dirs[randomInt(dirs.length)];
      const row = randomInt(gridSize);
      const col = randomInt(gridSize);
      const cells: [number, number][] = [];
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) { ok = false; break; }
        if (grid[r][c] !== "" && grid[r][c] !== word[i]) { ok = false; break; }
        cells.push([r, c]);
      }
      if (ok) {
        cells.forEach(([r, c], i) => { grid[r][c] = word[i]; });
        placed.push({ word, cells });
        break;
      }
    }
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < gridSize; r++) for (let c = 0; c < gridSize; c++) {
    if (!grid[r][c]) grid[r][c] = letters[randomInt(26)];
  }
  return { grid, placed };
}

function WordSearch() {
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [wordBank, setWordBank] = useState<WordBank>("math");

  const cfg = DIFFICULTY_CONFIG[difficulty];

  const buildGame = useCallback((diff: Difficulty, wb: WordBank) => {
    const c = DIFFICULTY_CONFIG[diff];
    const b = wb === "math" ? MATH_WORDS : GENERAL_WORDS;
    const filteredBank = b.filter(w => {
      if (diff === "easy") return w.length <= 7;
      if (diff === "medium") return w.length >= 4 && w.length <= 10;
      return w.length >= 5;
    });
    const w = shuffle(filteredBank).slice(0, c.wordCount);
    return { words: w, ...buildGrid(w, c.gridSize, c.dirs) };
  }, []);

  const [game, setGame] = useState(() => buildGame("medium", "math"));
  const { grid, placed, words: selectedWords } = game;

  const [found, setFound] = useState<string[]>([]);
  const [selecting, setSelecting] = useState<[number, number][]>([]);
  const activeRef = useRef(false);
  const [win, setWin] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const timer = useTimer(!win);

  const startNew = useCallback((diff: Difficulty, wb: WordBank) => {
    const g = buildGame(diff, wb);
    setGame(g);
    setFound([]); setSelecting([]); setWin(false); setHint(null);
    activeRef.current = false;
    timer.reset();
    logGame("Word Search", `${DIFFICULTY_CONFIG[diff].label} · ${wb === "math" ? "Math" : "General"}`);
  }, [buildGame]);

  useEffect(() => { logGame("Word Search", `${cfg.label} · ${wordBank === "math" ? "Math" : "General"}`); }, []);

  const getCellAt = (clientX: number, clientY: number): [number, number] | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const cell = (el as HTMLElement).closest("[data-row]") as HTMLElement | null;
    if (!cell) return null;
    const r = Number(cell.dataset.row), c = Number(cell.dataset.col);
    if (isNaN(r) || isNaN(c)) return null;
    return [r, c];
  };

  const addCell = useCallback((r: number, c: number) => {
    setSelecting(prev => {
      const last = prev[prev.length - 1];
      if (last && last[0] === r && last[1] === c) return prev;
      return [...prev, [r, c]];
    });
  }, []);

  const commitSelection = useCallback((sel: [number, number][]) => {
    activeRef.current = false;
    if (sel.length < 2) { setSelecting([]); return; }
    const sel_str = sel.map(([r, c]) => grid[r][c]).join("");
    const rev = [...sel_str].reverse().join("");
    let matched = false;
    setFound(prev => {
      for (const p of placed) {
        if ((p.word === sel_str || p.word === rev) && !prev.includes(p.word)) {
          const nf = [...prev, p.word];
          if (nf.length === selectedWords.length) setWin(true);
          matched = true;
          return nf;
        }
      }
      return prev;
    });
    setSelecting([]);
  }, [grid, placed, selectedWords]);

  // Mouse events
  const onMouseDown = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    activeRef.current = true;
    setSelecting([[r, c]]);
  };
  const onMouseEnter = (r: number, c: number) => {
    if (!activeRef.current) return;
    addCell(r, c);
  };
  const onMouseUp = useCallback(() => {
    if (!activeRef.current) return;
    setSelecting(prev => { commitSelection(prev); return []; });
  }, [commitSelection]);

  // Touch events on container
  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    const cell = getCellAt(t.clientX, t.clientY);
    if (cell) { activeRef.current = true; setSelecting([cell]); }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!activeRef.current) return;
    const t = e.touches[0];
    const cell = getCellAt(t.clientX, t.clientY);
    if (cell) addCell(cell[0], cell[1]);
  };
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!activeRef.current) return;
    setSelecting(prev => { commitSelection(prev); return []; });
  }, [commitSelection]);

  const isSelected = (r: number, c: number) => selecting.some(([sr, sc]) => sr === r && sc === c);
  const isFound = (r: number, c: number) => {
    for (const p of placed) {
      if (found.includes(p.word) && p.cells.some(([pr, pc]) => pr === r && pc === c)) return p.word;
    }
    return null;
  };

  const wordColors = ["#60a5fa","#34d399","#f59e0b","#a78bfa","#fb923c","#f472b6","#22d3ee","#86efac","#4ade80","#f97316"];

  const giveHint = () => {
    const remaining = placed.filter(p => !found.includes(p.word));
    if (!remaining.length) return;
    const p = pick(remaining);
    const [r, c] = p.cells[0];
    setHint(`"${p.word}" starts at row ${r+1}, col ${c+1}`);
    setTimeout(() => setHint(null), 4000);
  };

  const px = cfg.cellPx;
  const fontSize = px <= 22 ? "9px" : px <= 26 ? "11px" : "13px";

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Word bank selector */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(["math","general"] as WordBank[]).map(wb => (
            <button key={wb} onClick={() => { setWordBank(wb); startNew(difficulty, wb); }}
              className={cn("px-3 py-1.5 text-xs font-semibold transition-all", wordBank === wb ? "text-white" : "text-muted-foreground hover:text-white")}
              style={wordBank === wb ? { background: "rgba(96,165,250,0.25)", borderRight: "1px solid rgba(255,255,255,0.1)" } : { background: "rgba(255,255,255,0.04)" }}>
              {wb === "math" ? "📐 Math" : "🌍 General"}
            </button>
          ))}
        </div>
        {/* Difficulty selector */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(["easy","medium","hard"] as Difficulty[]).map(d => (
            <button key={d} onClick={() => { setDifficulty(d); startNew(d, wordBank); }}
              className={cn("px-3 py-1.5 text-xs font-semibold transition-all capitalize", difficulty === d ? "text-white" : "text-muted-foreground hover:text-white")}
              style={difficulty === d ? { background: d === "easy" ? "rgba(52,211,153,0.25)" : d === "medium" ? "rgba(251,191,36,0.25)" : "rgba(239,68,68,0.25)" } : { background: "rgba(255,255,255,0.04)" }}>
              {DIFFICULTY_CONFIG[d].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground">
            <span className="text-white font-semibold">{found.length}</span>/{selectedWords.length}
          </span>
          <span className="text-sm text-muted-foreground font-mono">{timer.fmt}</span>
          <button onClick={giveHint} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-yellow-500/30 text-yellow-300 hover:border-yellow-400/50 transition-all" style={{ background: "rgba(251,191,36,0.08)" }}>
            <Lightbulb className="w-3 h-3" />
          </button>
          <button onClick={() => startNew(difficulty, wordBank)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white transition-all">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {hint && <p className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">{hint}</p>}

      {win && (
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex items-center gap-3 p-4 rounded-xl" style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)" }}>
          <Trophy className="w-6 h-6 text-yellow-400" />
          <div>
            <p className="text-emerald-300 font-bold">All words found! +5 XP</p>
            <p className="text-xs text-muted-foreground">Time: {timer.fmt} · {DIFFICULTY_CONFIG[difficulty].label}</p>
          </div>
          <button onClick={() => startNew(difficulty, wordBank)} className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Play Again</button>
        </motion.div>
      )}

      <div className="flex gap-4 flex-wrap items-start">
        {/* Grid */}
        <div
          ref={gridRef}
          className="select-none touch-none"
          style={{ userSelect: "none", WebkitUserSelect: "none" }}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cfg.gridSize}, ${px}px)` }}>
            {grid.map((row, r) => row.map((cell, c) => {
              const sel = isSelected(r, c);
              const foundWord = isFound(r, c);
              const idx = foundWord ? selectedWords.indexOf(foundWord) : -1;
              const bg = sel ? "rgba(99,102,241,0.55)" : foundWord ? `${wordColors[idx % wordColors.length]}35` : "rgba(255,255,255,0.04)";
              return (
                <div
                  key={`${r}-${c}`}
                  data-row={r}
                  data-col={c}
                  onMouseDown={e => onMouseDown(e, r, c)}
                  onMouseEnter={() => onMouseEnter(r, c)}
                  style={{
                    width: px, height: px, fontSize, background: bg, cursor: "pointer",
                    color: sel ? "#fff" : foundWord ? wordColors[idx % wordColors.length] : "#9ca3af",
                    border: sel ? "1px solid rgba(99,102,241,0.7)" : "1px solid transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 3, fontWeight: "bold", fontFamily: "monospace",
                    transition: "background 0.08s, color 0.08s",
                    pointerEvents: "auto",
                  }}
                >
                  {cell}
                </div>
              );
            }))}
          </div>
        </div>

        {/* Word list */}
        <div className="flex flex-col gap-1.5 min-w-[110px]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Find these words</p>
          {selectedWords.map((w, i) => (
            <div key={w} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: wordColors[i % wordColors.length] }} />
              <span className={cn("text-[11px] font-mono font-semibold", found.includes(w) ? "line-through opacity-40" : "text-white")}>
                {found.includes(w) ? w : w}
              </span>
              {found.includes(w) && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Game 2: Complete the Word (Fill in the Blanks) ──────────────────────────

function CompleteWord() {
  const [idx, setIdx] = useState(() => randomInt(FILL_PUZZLES.length));
  const puzzle = FILL_PUZZLES[idx];
  const [inputs, setInputs] = useState<string[]>(() => Array(puzzle.word.length).fill(""));
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const timer = useTimer(!submitted);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const reset = (newIdx?: number) => {
    const ni = newIdx ?? (idx + 1) % FILL_PUZZLES.length;
    setIdx(ni);
    setInputs(Array(FILL_PUZZLES[ni].word.length).fill(""));
    setSubmitted(false);
    timer.reset();
  };

  useEffect(() => {
    setInputs(Array(puzzle.word.length).fill(""));
    setSubmitted(false);
  }, [idx]);

  const submit = () => {
    if (submitted) return;
    setSubmitted(true);
    setTotal(t => t + 1);
    const correct = puzzle.blanks.every(i => inputs[i]?.toUpperCase() === puzzle.word[i]);
    if (correct) setScore(s => s + 1);
  };

  const isCorrect = puzzle.blanks.every(i => inputs[i]?.toUpperCase() === puzzle.word[i]);

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Score: <span className="text-white font-semibold">{score}/{total}</span></span>
        <span className="text-sm font-mono text-muted-foreground">{timer.fmt}</span>
      </div>
      <div className="p-4 rounded-xl" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
        <p className="text-sm text-indigo-300 font-semibold mb-1">Hint:</p>
        <p className="text-sm text-slate-300 leading-relaxed">{puzzle.hint}</p>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {puzzle.word.split("").map((ch, i) => {
          const isBlank = puzzle.blanks.includes(i);
          if (!isBlank) {
            return (
              <div key={i} className="w-9 h-10 flex items-center justify-center rounded-lg text-base font-bold font-mono text-white" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                {ch}
              </div>
            );
          }
          const val = inputs[i] ?? "";
          const correct_letter = submitted ? val.toUpperCase() === ch : null;
          return (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              maxLength={1}
              value={val}
              disabled={submitted}
              onChange={e => {
                const v = e.target.value.toUpperCase().slice(-1);
                const next = [...inputs]; next[i] = v;
                setInputs(next);
                if (v) {
                  const nextBlank = puzzle.blanks.find(b => b > i);
                  if (nextBlank !== undefined) inputRefs.current[nextBlank]?.focus();
                }
              }}
              className={cn(
                "w-9 h-10 text-center text-base font-bold font-mono rounded-lg outline-none transition-all",
                submitted
                  ? correct_letter ? "text-emerald-300 border-2" : "text-red-300 border-2"
                  : "text-white border focus:border-indigo-400"
              )}
              style={{
                background: submitted ? (correct_letter ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.15)") : "rgba(99,102,241,0.12)",
                borderColor: submitted ? (correct_letter ? "#34d399" : "#f87171") : "rgba(99,102,241,0.4)",
              }}
            />
          );
        })}
      </div>
      {submitted && (
        <div className={cn("flex items-center gap-2 p-3 rounded-xl text-sm font-semibold", isCorrect ? "text-emerald-300" : "text-red-300")} style={{ background: isCorrect ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${isCorrect ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}` }}>
          {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {isCorrect ? "Correct! Well done." : `Answer: ${puzzle.word}`}
        </div>
      )}
      <div className="flex gap-2">
        {!submitted && (
          <button onClick={submit} disabled={puzzle.blanks.some(i => !inputs[i])} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all" style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)" }}>
            Check Answer
          </button>
        )}
        <button onClick={() => reset()} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm border border-white/10 text-muted-foreground hover:text-white transition-all">
          <ChevronRight className="w-4 h-4" /> Next Word
        </button>
      </div>
    </div>
  );
}

// ── Game 3: Anagram Solver ───────────────────────────────────────────────────

function AnagramGame() {
  const [idx, setIdx] = useState(() => randomInt(ANAGRAM_PUZZLES.length));
  const puzzle = ANAGRAM_PUZZLES[idx];
  const [shuffled, setShuffled] = useState(() => shuffle(puzzle.word.split("")));
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const timer = useTimer(!submitted && !revealed);

  const reset = useCallback((ni?: number) => {
    const nextIdx = ni ?? (idx + 1) % ANAGRAM_PUZZLES.length;
    const p = ANAGRAM_PUZZLES[nextIdx];
    setIdx(nextIdx);
    setShuffled(shuffle(p.word.split("")));
    setAnswer(""); setSubmitted(false); setRevealed(false);
    timer.reset();
  }, [idx]);

  useEffect(() => {
    setShuffled(shuffle(puzzle.word.split("")));
    setAnswer(""); setSubmitted(false); setRevealed(false);
  }, [idx]);

  const check = () => {
    if (submitted || revealed) return;
    setSubmitted(true);
    setTotal(t => t + 1);
    if (answer.toUpperCase() === puzzle.word) setScore(s => s + 1);
  };

  const correct = answer.toUpperCase() === puzzle.word;

  return (
    <div className="space-y-5 max-w-md">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Score: <span className="text-white font-semibold">{score}/{total}</span></span>
        <span className="text-sm font-mono text-muted-foreground">{timer.fmt}</span>
      </div>
      <div className="p-4 rounded-xl text-center" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
        <p className="text-xs text-yellow-400/70 font-semibold uppercase tracking-widest mb-2">Unscramble this word</p>
        <div className="flex gap-2 justify-center flex-wrap">
          {shuffled.map((ch, i) => (
            <div key={i} className="w-10 h-12 flex items-center justify-center rounded-xl text-lg font-bold font-mono text-yellow-300" style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)" }}>
              {ch}
            </div>
          ))}
        </div>
        <button onClick={() => setShuffled(s => shuffle([...s]))} className="mt-3 text-xs text-yellow-400/60 hover:text-yellow-300 transition-colors underline">
          Reshuffle
        </button>
      </div>
      <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <p className="text-xs text-muted-foreground mb-1">Hint:</p>
        <p className="text-sm text-slate-300">{puzzle.hint}</p>
      </div>
      <input
        type="text"
        value={answer}
        disabled={submitted || revealed}
        onChange={e => setAnswer(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === "Enter") check(); }}
        placeholder="Type your answer…"
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white text-base font-mono font-semibold tracking-widest uppercase placeholder:text-muted-foreground/50 focus:outline-none focus:border-yellow-400/50 transition-colors"
      />
      {(submitted || revealed) && (
        <div className={cn("flex items-center gap-2 p-3 rounded-xl text-sm font-semibold", correct ? "text-emerald-300" : "text-red-300")} style={{ background: correct ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${correct ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}` }}>
          {correct ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {correct ? "Correct!" : `Answer: ${puzzle.word}`}
        </div>
      )}
      <div className="flex gap-2">
        {!submitted && !revealed && (
          <>
            <button onClick={check} disabled={!answer} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all" style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)" }}>
              Check
            </button>
            <button onClick={() => { setRevealed(true); setTotal(t => t + 1); }} className="px-4 py-2.5 rounded-xl text-xs border border-white/10 text-muted-foreground hover:text-white transition-all">
              Give Up
            </button>
          </>
        )}
        <button onClick={() => reset()} className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm border border-white/10 text-muted-foreground hover:text-white transition-all">
          <ChevronRight className="w-4 h-4" /> Next
        </button>
      </div>
    </div>
  );
}

// ── Game 4: Math Trivia Quiz ─────────────────────────────────────────────────

function MathTrivia() {
  const [questions] = useState(() => shuffle(MATH_TRIVIA));
  const [qi, setQi] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const timer = useTimer(!done);

  const q = questions[qi];

  const choose = (opt: number) => {
    if (selected !== null) return;
    setSelected(opt);
    if (opt === q.answer) setScore(s => s + 1);
  };

  const next = () => {
    if (qi + 1 >= questions.length) { setDone(true); return; }
    setQi(qi + 1); setSelected(null);
  };

  const restart = () => { setQi(0); setSelected(null); setScore(0); setDone(false); timer.reset(); };

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="text-center space-y-5 max-w-md py-4">
        <Trophy className={cn("w-14 h-14 mx-auto", pct >= 80 ? "text-yellow-400" : pct >= 50 ? "text-blue-400" : "text-slate-400")} />
        <div>
          <p className="text-2xl font-display font-black text-white">{score}/{questions.length}</p>
          <p className="text-muted-foreground text-sm">{pct >= 80 ? "Excellent work!" : pct >= 50 ? "Good effort!" : "Keep practising!"}</p>
          <p className="text-xs text-muted-foreground mt-1">Time: {timer.fmt}</p>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {questions.map((q2, i) => (
            <div key={i} className={cn("h-8 rounded-lg flex items-center justify-center text-xs font-bold", i < qi || done ? (q2.answer === (selected ?? -99) ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/10 text-red-300") : "bg-white/5 text-muted-foreground")}>
              {i + 1}
            </div>
          ))}
        </div>
        <button onClick={restart} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)" }}>
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Q{qi+1}/{questions.length}</span>
          <div className="w-32 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${((qi+1)/questions.length)*100}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground font-mono">{timer.fmt}</span>
          <span className="text-sm text-yellow-400 font-semibold">{score} pts</span>
        </div>
      </div>
      <div className="p-5 rounded-2xl" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
        <p className="text-base font-semibold text-white leading-relaxed">{q.q}</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {q.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = i === q.answer;
          const show = selected !== null;
          return (
            <button key={i} onClick={() => choose(i)} disabled={selected !== null}
              className={cn("w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-all border",
                show
                  ? isCorrect ? "text-emerald-300 border-emerald-500/50" : isSelected ? "text-red-300 border-red-500/30" : "text-muted-foreground border-white/8"
                  : "text-white border-white/10 hover:border-indigo-400/50 hover:bg-indigo-500/8"
              )}
              style={{ background: show ? isCorrect ? "rgba(52,211,153,0.1)" : isSelected ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)" }}
            >
              <span className="mr-2 text-muted-foreground">{["A","B","C","D"][i]}.</span> {opt}
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="p-3 rounded-xl text-sm text-slate-300 leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="font-semibold text-white">Explanation: </span>{q.explanation}
        </div>
      )}
      {selected !== null && (
        <button onClick={next} className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all" style={{ background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.4)" }}>
          {qi + 1 >= questions.length ? "See Results" : "Next Question"} →
        </button>
      )}
    </div>
  );
}

// ── Game 5: Spelling Bee (Math Edition) ─────────────────────────────────────

const BEE_SETS: { center: string; letters: string[]; words: string[] }[] = [
  {
    center: "A",
    letters: ["A","L","G","E","B","R","X"],
    words: ["ALGEBRA","REAL","AREA","BARE","BALE","GEAR","LAGER","EAGER","REGAL","LARGE","LABEL","EABLE","ALGEBRA"],
  },
  {
    center: "I",
    letters: ["I","N","T","E","G","R","A"],
    words: ["INTEGER","TRIANGLE","GREAT","GRAIN","GRANT","TRAIN","RANGE","TIGER","ANGER","INTER","REIGN","RATING","RETINA","EATING","TEARING","INTEGRATE"],
  },
  {
    center: "O",
    letters: ["O","P","R","B","A","L","E"],
    words: ["PARABOLA","POLAR","PROBE","LABOR","OPERA","ROBE","BORE","ROPE","PORE","BALE","ROLE","POLE","LORE","ABLE","ORAL"],
  },
];

function SpellingBee() {
  const [setIdx, setSetIdx] = useState(0);
  const bee = BEE_SETS[setIdx];
  const [input, setInput] = useState("");
  const [found, setFound] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const timer = useTimer(true);

  const reset = () => {
    const ni = (setIdx + 1) % BEE_SETS.length;
    setSetIdx(ni); setFound([]); setInput(""); setError(null); setScore(0); timer.reset();
  };

  const submit = () => {
    const w = input.toUpperCase().trim();
    setInput("");
    if (w.length < 3) { setError("Word must be at least 3 letters"); setTimeout(() => setError(null), 2000); return; }
    if (!w.includes(bee.center)) { setError(`Must include the centre letter "${bee.center}"`); setTimeout(() => setError(null), 2500); return; }
    if (w.split("").some(c => !bee.letters.includes(c))) { setError("Use only the available letters"); setTimeout(() => setError(null), 2500); return; }
    if (found.includes(w)) { setError("Already found!"); setTimeout(() => setError(null), 1500); return; }
    if (!bee.words.includes(w)) { setError("Not in our word list"); setTimeout(() => setError(null), 2000); return; }
    setFound(f => [...f, w]);
    setScore(s => s + w.length * (w.length >= 6 ? 3 : 1));
    setError(null);
  };

  const hexPositions = [
    { top: "0%", left: "50%", transform: "translate(-50%,-50%)" },
    { top: "25%", left: "82%", transform: "translate(-50%,-50%)" },
    { top: "75%", left: "82%", transform: "translate(-50%,-50%)" },
    { top: "100%", left: "50%", transform: "translate(-50%,-50%)" },
    { top: "75%", left: "18%", transform: "translate(-50%,-50%)" },
    { top: "25%", left: "18%", transform: "translate(-50%,-50%)" },
  ];

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-yellow-400">{score} pts</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground font-mono">{timer.fmt}</span>
          <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white">
            <RefreshCw className="w-3.5 h-3.5" /> New Set
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Create words using the letters shown. Must include the <span className="text-yellow-300 font-semibold">gold centre letter</span>. Min 3 letters.</p>
      <div className="relative w-44 h-44 mx-auto my-2">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-black cursor-pointer hover:scale-110 transition-transform" style={{ background: "#fbbf24" }}
            onClick={() => setInput(i => i + bee.center)}>
            {bee.center}
          </div>
        </div>
        {bee.letters.filter(l => l !== bee.center).slice(0, 6).map((l, i) => (
          <button key={l} className="absolute w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white hover:scale-110 transition-transform" style={{ ...hexPositions[i] as React.CSSProperties, background: "rgba(255,255,255,0.1)", border: "2px solid rgba(255,255,255,0.2)" }}
            onClick={() => setInput(p => p + l)}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Backspace") setInput(i => i.slice(0,-1)); }}
          placeholder="Type or click letters…"
          className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white font-mono font-bold tracking-widest placeholder:text-muted-foreground/50 focus:outline-none focus:border-yellow-400/50 uppercase"
        />
        <button onClick={submit} className="px-4 py-2.5 rounded-xl text-sm font-bold text-black" style={{ background: "#fbbf24" }}>
          Enter
        </button>
        <button onClick={() => setInput(i => i.slice(0,-1))} className="px-3 py-2.5 rounded-xl text-sm border border-white/10 text-muted-foreground hover:text-white">
          ⌫
        </button>
      </div>
      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Found ({found.length}):</p>
        <div className="flex flex-wrap gap-1.5">
          {found.map(w => (
            <span key={w} className="px-2.5 py-1 rounded-full text-xs font-semibold font-mono text-emerald-300" style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)" }}>{w}</span>
          ))}
          {found.length === 0 && <span className="text-xs text-muted-foreground/60">No words yet</span>}
        </div>
      </div>
    </div>
  );
}

// ── Game 6: Number Sequence ──────────────────────────────────────────────────

const SEQUENCES: { nums: (number | "?")[]; answer: number; rule: string; hint: string }[] = [
  { nums: [2,4,6,8,"?"],         answer: 10,  rule: "+2",             hint: "Add 2 each time" },
  { nums: [1,4,9,16,"?"],        answer: 25,  rule: "n²",             hint: "Perfect squares: 1², 2², 3², …" },
  { nums: [1,1,2,3,5,"?"],       answer: 8,   rule: "Fibonacci",      hint: "Each term = sum of previous two" },
  { nums: [3,6,12,24,"?"],       answer: 48,  rule: "×2",             hint: "Multiply by 2 each time" },
  { nums: [100,90,81,73,"?"],    answer: 66,  rule: "-10,-9,-8,…",    hint: "Difference decreases by 1 each step" },
  { nums: [2,3,5,7,11,"?"],      answer: 13,  rule: "Primes",         hint: "Consecutive prime numbers" },
  { nums: [0,1,4,9,16,"?"],      answer: 25,  rule: "n²",             hint: "0², 1², 2², 3², 4², …" },
  { nums: [1,8,27,64,"?"],       answer: 125, rule: "n³",             hint: "Perfect cubes: 1³, 2³, 3³, …" },
  { nums: [5,10,20,40,"?"],      answer: 80,  rule: "×2",             hint: "Double each time" },
  { nums: [1,3,7,15,31,"?"],     answer: 63,  rule: "×2+1",          hint: "Multiply by 2 then add 1" },
  { nums: [256,128,64,32,"?"],   answer: 16,  rule: "÷2",             hint: "Halve each time" },
  { nums: [1,2,6,24,120,"?"],    answer: 720, rule: "n!",             hint: "Factorials: 1!, 2!, 3!, 4!, 5!, …" },
];

function NumberSequence() {
  const [idx, setIdx] = useState(() => randomInt(SEQUENCES.length));
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const seq = SEQUENCES[idx];

  const next = useCallback(() => {
    setIdx(i => (i + 1) % SEQUENCES.length);
    setGuess(""); setResult(null); setShowHint(false);
  }, []);

  const check = () => {
    const n = Number(guess.trim());
    if (isNaN(n)) return;
    if (n === seq.answer) {
      setResult("correct");
      setScore(s => s + (showHint ? 1 : 2));
      setStreak(s => s + 1);
    } else {
      setResult("wrong");
      setStreak(0);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-emerald-400">{score} pts</span>
          {streak >= 2 && <span className="text-xs text-orange-400 font-semibold">🔥 {streak} streak</span>}
        </div>
        <button onClick={() => { next(); setScore(0); setStreak(0); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white">
          <RefreshCw className="w-3.5 h-3.5" /> New Game
        </button>
      </div>

      <div className="p-5 rounded-2xl text-center space-y-4" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">What comes next?</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {seq.nums.map((n, i) => (
            <div key={i} className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-black"
              style={n === "?" ? { background: "rgba(16,185,129,0.2)", border: "2px dashed rgba(16,185,129,0.5)", color: "#6ee7b7" } : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
              {n}
            </div>
          ))}
        </div>
        <div className="flex gap-2 max-w-xs mx-auto">
          <input
            type="number"
            value={guess}
            onChange={e => { setGuess(e.target.value); setResult(null); }}
            onKeyDown={e => { if (e.key === "Enter") check(); }}
            placeholder="Your answer…"
            className="flex-1 px-4 py-2.5 rounded-xl text-center text-white font-bold text-lg focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }}
            disabled={result === "correct"}
          />
          <button onClick={check} disabled={!guess.trim() || result === "correct"}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50"
            style={{ background: "#10b981" }}>
            Check
          </button>
        </div>

        {result === "correct" && (
          <div className="p-3 rounded-xl text-center" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)" }}>
            <p className="text-emerald-300 font-bold">✓ Correct! The answer is {seq.answer}</p>
            <p className="text-xs text-muted-foreground mt-1">Rule: {seq.rule}</p>
            <button onClick={next} className="mt-2 px-4 py-1.5 rounded-lg text-xs font-bold text-black" style={{ background: "#10b981" }}>Next →</button>
          </div>
        )}
        {result === "wrong" && (
          <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <p className="text-red-400 font-semibold text-sm">✗ Not quite — try again!</p>
          </div>
        )}
        {!showHint && result !== "correct" && (
          <button onClick={() => setShowHint(true)} className="text-xs text-muted-foreground hover:text-yellow-300 transition-colors flex items-center gap-1 mx-auto">
            <Lightbulb className="w-3.5 h-3.5" /> Show hint (−1 pt)
          </button>
        )}
        {showHint && <p className="text-xs text-yellow-300 italic">💡 {seq.hint}</p>}
      </div>
    </div>
  );
}

// ── Game 7: Math Flash Cards ─────────────────────────────────────────────────

type FlashOp = "+" | "−" | "×" | "÷";

function genFlash(op: FlashOp): { q: string; a: number } {
  const r = (min: number, max: number) => randomInt(max - min + 1) + min;
  if (op === "+") { const a = r(10,99), b = r(10,99); return { q: `${a} + ${b}`, a: a+b }; }
  if (op === "−") { const a = r(20,99), b = r(10, a); return { q: `${a} − ${b}`, a: a-b }; }
  if (op === "×") { const a = r(2,12), b = r(2,12); return { q: `${a} × ${b}`, a: a*b }; }
  const b = r(2,12); const a = b * r(2,12); return { q: `${a} ÷ ${b}`, a: a/b };
}

function MathFlashCards() {
  const [op, setOp] = useState<FlashOp>("+");
  const [card, setCard] = useState(() => genFlash("+"));
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const timer = useTimer(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const nextCard = useCallback((newOp?: FlashOp) => {
    const o = newOp ?? op;
    setCard(genFlash(o));
    setGuess(""); setFeedback(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [op]);

  const submit = () => {
    const n = Number(guess.trim());
    if (isNaN(n) || guess.trim() === "") return;
    const correct = n === card.a;
    setFeedback(correct ? "correct" : "wrong");
    setTotal(t => t + 1);
    if (correct) setScore(s => s + 1);
    setTimeout(() => nextCard(), 800);
  };

  const setOperation = (o: FlashOp) => { setOp(o); setScore(0); setTotal(0); nextCard(o); };

  const ops: { op: FlashOp; label: string; color: string }[] = [
    { op: "+", label: "Addition",       color: "rgba(16,185,129,0.2)"  },
    { op: "−", label: "Subtraction",    color: "rgba(99,102,241,0.2)"  },
    { op: "×", label: "Multiplication", color: "rgba(245,158,11,0.2)"  },
    { op: "÷", label: "Division",       color: "rgba(239,68,68,0.2)"   },
  ];

  return (
    <div className="space-y-5 max-w-md">
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono text-muted-foreground">{timer.fmt}</span>
        <span className="text-sm font-bold text-white">{score}/{total} correct</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {ops.map(o => (
          <button key={o.op} onClick={() => setOperation(o.op)}
            className={cn("py-2 rounded-xl text-sm font-bold transition-all", op === o.op ? "text-white" : "text-muted-foreground hover:text-white")}
            style={{ background: op === o.op ? o.color : "rgba(255,255,255,0.04)", border: `1px solid ${op === o.op ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)"}` }}>
            {o.op}
          </button>
        ))}
      </div>

      <div className={cn("p-8 rounded-2xl text-center transition-all duration-200",
          feedback === "correct" ? "bg-emerald-500/10 border-emerald-500/30" : feedback === "wrong" ? "bg-red-500/10 border-red-500/30" : "border-white/10")}
        style={{ border: "1px solid", background: feedback === "correct" ? "rgba(16,185,129,0.1)" : feedback === "wrong" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.03)" }}>
        <p className="text-4xl font-black text-white font-mono tracking-wide">{card.q} = ?</p>
        {feedback === "correct" && <p className="text-emerald-400 mt-2 font-bold text-lg">✓ {card.a}</p>}
        {feedback === "wrong" && <p className="text-red-400 mt-2 font-bold text-lg">✗ Answer: {card.a}</p>}
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="number"
          value={guess}
          onChange={e => setGuess(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="Type your answer and press Enter…"
          className="flex-1 px-4 py-3 rounded-xl text-white text-center font-bold text-lg focus:outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }}
          disabled={!!feedback}
          autoFocus
        />
        <button onClick={submit} disabled={!guess.trim() || !!feedback}
          className="px-5 py-3 rounded-xl font-bold text-black text-sm disabled:opacity-40"
          style={{ background: "#10b981" }}>
          Submit
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">Enter</kbd> to submit instantly</p>
    </div>
  );
}

// ── Game 8: Math Crossword ───────────────────────────────────────────────────

const CROSSWORD_PUZZLES = [
  {
    title: "Puzzle 1",
    across: [
      { num: 1, clue: "Opposite of addition",           answer: "SUBTRACT", row: 0, col: 0 },
      { num: 3, clue: "A shape with 3 sides",            answer: "TRIANGLE", row: 2, col: 0 },
      { num: 5, clue: "2, 3, 5, 7 are examples of this",answer: "PRIME",    row: 4, col: 0 },
    ],
    down: [
      { num: 2, clue: "Product of all integers up to n", answer: "FACTORIAL", row: 0, col: 3 },
      { num: 4, clue: "Ratio of circumference to diameter", answer: "PI",   row: 2, col: 5 },
    ],
  },
  {
    title: "Puzzle 2",
    across: [
      { num: 1, clue: "Square root of 144",              answer: "TWELVE",  row: 0, col: 0 },
      { num: 3, clue: "f(x) describes a …",              answer: "FUNCTION", row: 2, col: 0 },
      { num: 5, clue: "Bottom part of a fraction",        answer: "DENOMINATOR", row: 4, col: 0 },
    ],
    down: [
      { num: 2, clue: "Repeating pattern in geometry",    answer: "TESSELLATION", row: 0, col: 2 },
      { num: 4, clue: "Angle greater than 90°",           answer: "OBTUSE",  row: 2, col: 4 },
    ],
  },
];

function MathCrossword() {
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const puzzle = CROSSWORD_PUZZLES[puzzleIdx];
  type Dir = "across" | "down";
  type Entry = typeof puzzle.across[0] | typeof puzzle.down[0];

  const allEntries: (Entry & { dir: Dir })[] = [
    ...puzzle.across.map(e => ({ ...e, dir: "across" as Dir })),
    ...puzzle.down.map(e => ({ ...e, dir: "down" as Dir })),
  ];

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const cellKey = (r: number, c: number) => `${r},${c}`;

  const cellMap: Record<string, { entries: string[]; number?: number }> = {};
  for (const entry of allEntries) {
    for (let i = 0; i < entry.answer.length; i++) {
      const r = entry.dir === "across" ? entry.row : entry.row + i;
      const c = entry.dir === "across" ? entry.col + i : entry.col;
      const k = cellKey(r, c);
      if (!cellMap[k]) cellMap[k] = { entries: [] };
      cellMap[k].entries.push(`${entry.num}${entry.dir[0]}`);
      if (i === 0) cellMap[k].number = entry.num;
    }
  }

  const rows = Math.max(...Object.keys(cellMap).map(k => Number(k.split(",")[0]))) + 1;
  const cols = Math.max(...Object.keys(cellMap).map(k => Number(k.split(",")[1]))) + 1;

  const correct = (r: number, c: number) => {
    if (!checked && !revealed) return null;
    for (const entry of allEntries) {
      for (let i = 0; i < entry.answer.length; i++) {
        const er = entry.dir === "across" ? entry.row : entry.row + i;
        const ec = entry.dir === "across" ? entry.col + i : entry.col;
        if (er === r && ec === c) {
          const typed = (answers[`${entry.num}${entry.dir[0]}`] ?? "")[i]?.toUpperCase() ?? "";
          return typed === entry.answer[i];
        }
      }
    }
    return null;
  };

  const reveal = () => {
    const filled: Record<string, string> = {};
    for (const e of allEntries) filled[`${e.num}${e.dir[0]}`] = e.answer;
    setAnswers(filled); setRevealed(true); setChecked(false);
  };

  const reset = () => { setAnswers({}); setChecked(false); setRevealed(false); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          {CROSSWORD_PUZZLES.map((p, i) => (
            <button key={i} onClick={() => { setPuzzleIdx(i); reset(); }}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all", puzzleIdx === i ? "text-white border-indigo-500/50" : "text-muted-foreground border-white/10 hover:text-white")}
              style={{ background: puzzleIdx === i ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)" }}>
              {p.title}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setChecked(true)} className="px-3 py-1.5 rounded-lg text-xs border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all">Check</button>
          <button onClick={reveal} className="px-3 py-1.5 rounded-lg text-xs border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-all">Reveal</button>
          <button onClick={reset} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white transition-all">Reset</button>
        </div>
      </div>

      <div className="flex gap-5 flex-wrap">
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => {
                    const k = cellKey(r, c);
                    const cell = cellMap[k];
                    if (!cell) return <td key={c} className="w-8 h-8" style={{ background: "#0a0c14" }} />;
                    const cr = correct(r, c);
                    return (
                      <td key={c} className="relative p-0" style={{ border: "1px solid rgba(255,255,255,0.15)", width: 32, height: 32 }}>
                        {cell.number && (
                          <span className="absolute top-0.5 left-0.5 text-[8px] text-muted-foreground font-bold leading-none z-10">{cell.number}</span>
                        )}
                        <input
                          maxLength={1}
                          value={
                            (() => {
                              for (const e of allEntries) {
                                for (let i = 0; i < e.answer.length; i++) {
                                  const er = e.dir === "across" ? e.row : e.row + i;
                                  const ec = e.dir === "across" ? e.col + i : e.col;
                                  if (er === r && ec === c) return (answers[`${e.num}${e.dir[0]}`] ?? "")[i] ?? "";
                                }
                              }
                              return "";
                            })()
                          }
                          onChange={ev => {
                            const ch = ev.target.value.toUpperCase().slice(-1);
                            const na = { ...answers };
                            for (const e of allEntries) {
                              for (let i = 0; i < e.answer.length; i++) {
                                const er = e.dir === "across" ? e.row : e.row + i;
                                const ec = e.dir === "across" ? e.col + i : e.col;
                                if (er === r && ec === c) {
                                  const k2 = `${e.num}${e.dir[0]}`;
                                  const prev = (na[k2] ?? "").padEnd(e.answer.length, " ");
                                  na[k2] = prev.substring(0, i) + ch + prev.substring(i + 1);
                                }
                              }
                            }
                            setAnswers(na); setChecked(false); setRevealed(false);
                          }}
                          className="w-full h-full text-center text-xs font-bold text-white uppercase focus:outline-none"
                          style={{ background: cr === true ? "rgba(16,185,129,0.2)" : cr === false ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.04)", paddingTop: cell.number ? "8px" : 0 }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex-1 min-w-0 space-y-3 text-sm">
          <div>
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1.5">Across</p>
            {puzzle.across.map(e => (
              <p key={e.num} className="text-xs text-muted-foreground mb-1">
                <span className="text-white font-semibold mr-1">{e.num}.</span>{e.clue} ({e.answer.length})
              </p>
            ))}
          </div>
          <div>
            <p className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-1.5">Down</p>
            {puzzle.down.map(e => (
              <p key={e.num} className="text-xs text-muted-foreground mb-1">
                <span className="text-white font-semibold mr-1">{e.num}.</span>{e.clue} ({e.answer.length})
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Game Hub ─────────────────────────────────────────────────────────────────

const GAMES = [
  { id: "wordsearch",  label: "Word Search",      emoji: "🔍", desc: "Find hidden math terms in the grid",          color: "text-blue-400",    bg: "rgba(96,165,250,0.08)",   border: "rgba(96,165,250,0.25)"   },
  { id: "complete",    label: "Fill the Blanks",   emoji: "📝", desc: "Fill in missing letters of math words",       color: "text-violet-400",  bg: "rgba(167,139,250,0.08)",  border: "rgba(167,139,250,0.25)"  },
  { id: "anagram",     label: "Anagram Solver",    emoji: "🔀", desc: "Unscramble shuffled math vocabulary",         color: "text-yellow-400",  bg: "rgba(251,191,36,0.08)",   border: "rgba(251,191,36,0.25)"   },
  { id: "trivia",      label: "Math Trivia",       emoji: "🧠", desc: "10-question quiz on math concepts",           color: "text-emerald-400", bg: "rgba(52,211,153,0.08)",   border: "rgba(52,211,153,0.25)"   },
  { id: "spelling",    label: "Spelling Bee",      emoji: "🐝", desc: "Build words from a honeycomb of letters",    color: "text-orange-400",  bg: "rgba(251,146,60,0.08)",   border: "rgba(251,146,60,0.25)"   },
  { id: "sequence",    label: "Number Sequence",   emoji: "🔢", desc: "Find the next number in the pattern",         color: "text-teal-400",    bg: "rgba(20,184,166,0.08)",   border: "rgba(20,184,166,0.25)"   },
  { id: "flashcards",  label: "Flash Cards",       emoji: "⚡", desc: "Rapid-fire mental arithmetic — beat the clock", color: "text-rose-400",  bg: "rgba(251,113,133,0.08)",  border: "rgba(251,113,133,0.25)"  },
  { id: "crossword",   label: "Math Crossword",    emoji: "⬛", desc: "Fill in the crossword using math clues",      color: "text-indigo-400",  bg: "rgba(99,102,241,0.08)",   border: "rgba(99,102,241,0.25)"   },
];

export default function PuzzlesTab() {
  const [active, setActive] = useState<string | null>(null);
  const game = GAMES.find(g => g.id === active);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-4xl mx-auto">
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.06))", border: "1px solid rgba(99,102,241,0.25)" }}>
        <div className="p-3 rounded-2xl text-2xl" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>🎮</div>
        <div>
          <h2 className="text-xl font-display font-black text-white">Math Puzzle Games</h2>
          <p className="text-sm text-muted-foreground">8 games to sharpen your maths vocabulary and mental arithmetic</p>
        </div>
        {active && (
          <button onClick={() => setActive(null)} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border border-white/10 text-muted-foreground hover:text-white transition-all">
            ← All Games
          </button>
        )}
      </div>

      {!active ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GAMES.map(g => (
            <button key={g.id} onClick={() => { setActive(g.id); if (g.id !== "wordsearch") logGame(g.label); }}
              className="p-5 rounded-2xl text-left hover:scale-[1.02] transition-all group"
              style={{ background: g.bg, border: `1px solid ${g.border}` }}>
              <div className="text-3xl mb-3">{g.emoji}</div>
              <p className={cn("text-base font-display font-bold", g.color)}>{g.label}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{g.desc}</p>
              <div className={cn("mt-3 flex items-center gap-1 text-xs font-semibold", g.color)}>
                Play Now <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xl">{game?.emoji}</span>
            <h3 className={cn("font-display font-bold text-lg", game?.color)}>{game?.label}</h3>
          </div>
          {active === "wordsearch"  && <WordSearch />}
          {active === "complete"    && <CompleteWord />}
          {active === "anagram"     && <AnagramGame />}
          {active === "trivia"      && <MathTrivia />}
          {active === "spelling"    && <SpellingBee />}
          {active === "sequence"    && <NumberSequence />}
          {active === "flashcards"  && <MathFlashCards />}
          {active === "crossword"   && <MathCrossword />}
        </div>
      )}
    </motion.div>
  );
}
