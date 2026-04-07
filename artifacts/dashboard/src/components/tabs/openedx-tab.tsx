import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, ExternalLink, Loader2, Sparkles,
  Globe, GraduationCap, Award, Search, Volume2, X, ArrowUpRight, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }


// ── Dictionary Widget ─────────────────────────────────────────────────────────

interface DictEntry { word: string; phonetic?: string; meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[]; }

function DictionaryWidget() {
  const [word, setWord] = useState("");
  const [result, setResult] = useState<DictEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookup = useCallback(async (w = word) => {
    if (!w.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w.trim())}`);
      if (!res.ok) { setError(`No definition found for "${w.trim()}"`); return; }
      const data = await res.json() as DictEntry[];
      setResult(data[0]);
    } catch { setError("Could not connect to dictionary. Check your internet connection."); }
    finally { setLoading(false); }
  }, [word]);

  const speak = (text: string) => {
    if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(text); u.lang = "en-GB"; speechSynthesis.speak(u); }
  };

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
      <div className="flex items-center gap-2">
        <span className="text-lg">📖</span>
        <p className="text-sm font-semibold text-white">English Dictionary</p>
        <span className="text-xs text-muted-foreground">— look up any word</span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={word} onChange={e => setWord(e.target.value)} onKeyDown={e => e.key === "Enter" && lookup()}
            placeholder="Type a word to look up…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-400/40 transition-colors placeholder:text-muted-foreground/60" />
        </div>
        {loading ? (
          <button disabled className="px-4 py-2.5 rounded-xl text-sm" style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)" }}>
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          </button>
        ) : (
          <button onClick={() => lookup()} disabled={!word.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
            style={{ background: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.35)" }}>
            Look up
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-sm text-red-400 flex items-center gap-1.5">
            <X className="w-4 h-4" />{error}
          </motion.p>
        )}
        {result && (
          <motion.div key={result.word} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl p-3 space-y-3" style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)" }}>
            <div className="flex items-center gap-3">
              <p className="text-lg font-display font-bold text-white">{result.word}</p>
              {result.phonetic && <p className="text-sm text-muted-foreground">{result.phonetic}</p>}
              <button onClick={() => speak(result.word)} className="ml-auto p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"><Volume2 className="w-4 h-4" /></button>
            </div>
            {result.meanings.slice(0, 3).map((m, mi) => (
              <div key={mi} className="space-y-1.5">
                <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">{m.partOfSpeech}</p>
                {m.definitions.slice(0, 2).map((d, di) => (
                  <div key={di}>
                    <p className="text-sm text-white/80">· {d.definition}</p>
                    {d.example && <p className="text-xs text-muted-foreground italic ml-3 mt-0.5">"{d.example}"</p>}
                  </div>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── English & Science Books ────────────────────────────────────────────────────

type GenReaderType = "pdf" | "html" | "ai";
interface GenBook { id: string; title: string; author: string; subject: string; icon: string; color: string; border: string; textColor: string; desc: string; topics: string[]; url: string; free: boolean; readerType: GenReaderType; }

const GENERAL_BOOKS: GenBook[] = [
  // English
  { id:"en1", subject:"English", icon:"📗", color:"rgba(52,211,153,0.08)", border:"rgba(52,211,153,0.25)", textColor:"#6ee7b7",
    title:"English Grammar in Use", author:"Raymond Murphy",
    desc:"The world's best-selling English grammar reference. Self-study grammar with exercises and answers.", free:false,
    topics:["Grammar","Tenses","Articles","Prepositions","Conditionals"], readerType:"ai",
    url:"https://www.cambridge.org/gb/cambridgeenglish/catalog/grammar-vocabulary-and-pronunciation/english-grammar-use-5th-edition" },
  { id:"en2", subject:"English", icon:"📘", color:"rgba(96,165,250,0.08)", border:"rgba(96,165,250,0.25)", textColor:"#93c5fd",
    title:"The Elements of Style", author:"Strunk & White",
    desc:"Timeless writing guide covering grammar rules, composition principles, and style. Free public domain text.", free:true,
    topics:["Writing","Grammar","Style","Composition","Punctuation"], readerType:"html",
    url:"https://www.gutenberg.org/files/37134/37134-h/37134-h.htm" },
  { id:"en3", subject:"English", icon:"📙", color:"rgba(251,146,60,0.08)", border:"rgba(251,146,60,0.25)", textColor:"#fdba74",
    title:"Literature: An Introduction to Fiction, Poetry, Drama", author:"Kennedy & Gioia",
    desc:"Comprehensive literature anthology for O-Level and A-Level English literature study.", free:false,
    topics:["Poetry","Fiction","Drama","Literary Analysis","Comprehension"], readerType:"ai",
    url:"https://www.pearson.com/en-us/subject-catalog/p/literature-an-introduction-to-fiction-poetry-drama-and-writing/P200000006277" },
  { id:"en4", subject:"English", icon:"📕", color:"rgba(244,63,94,0.08)", border:"rgba(244,63,94,0.25)", textColor:"#fda4af",
    title:"Oxford English for Zimbabwe", author:"Oxford University Press",
    desc:"English textbooks written for the Zimbabwe O-Level curriculum. Includes comprehension, grammar, and composition.",
    free:false, topics:["Comprehension","Grammar","Composition","Literature","Vocabulary"], readerType:"ai",
    url:"https://global.oup.com/education/content/secondary/series/oxford-english-for-zimbabwe/" },

  // Science
  { id:"sc1", subject:"Science", icon:"🔬", color:"rgba(168,85,247,0.08)", border:"rgba(168,85,247,0.25)", textColor:"#d8b4fe",
    title:"CK-12 Biology", author:"CK-12 Foundation",
    desc:"Free, open-source biology textbook for O-Level students. Cells, genetics, ecosystems, and human biology.", free:true,
    topics:["Cell Biology","Genetics","Evolution","Ecosystems","Human Body","Photosynthesis"], readerType:"html",
    url:"https://www.ck12.org/biology/" },
  { id:"sc2", subject:"Science", icon:"⚗️", color:"rgba(20,184,166,0.08)", border:"rgba(20,184,166,0.25)", textColor:"#5eead4",
    title:"CK-12 Chemistry", author:"CK-12 Foundation",
    desc:"Free chemistry textbook for O-Level. Atoms, bonding, reactions, stoichiometry, and organic chemistry.", free:true,
    topics:["Atomic Structure","Periodic Table","Bonding","Reactions","Stoichiometry","Organic"], readerType:"html",
    url:"https://www.ck12.org/chemistry/" },
  { id:"sc3", subject:"Science", icon:"⚡", color:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.25)", textColor:"#fde68a",
    title:"CK-12 Physics", author:"CK-12 Foundation",
    desc:"Free physics textbook for O-Level. Mechanics, waves, electricity, magnetism, and modern physics.", free:true,
    topics:["Mechanics","Waves","Electricity","Magnetism","Light","Nuclear Physics"], readerType:"html",
    url:"https://www.ck12.org/physics/" },
  { id:"sc4", subject:"Science", icon:"🌍", color:"rgba(6,182,212,0.08)", border:"rgba(6,182,212,0.25)", textColor:"#67e8f9",
    title:"OpenStax Biology 2e", author:"OpenStax",
    desc:"Peer-reviewed, free biology textbook. Comprehensive from molecular biology to ecosystems.", free:true,
    topics:["Molecular Biology","Cell Division","Genetics","Evolution","Ecology","Human Physiology"], readerType:"pdf",
    url:"https://assets.openstax.org/oscms-prodcms/media/documents/Biology2e-WEB.pdf" },
  { id:"sc5", subject:"Science", icon:"🔭", color:"rgba(99,102,241,0.08)", border:"rgba(99,102,241,0.25)", textColor:"#a5b4fc",
    title:"OpenStax Chemistry: Atoms First 2e", author:"OpenStax",
    desc:"Free, peer-reviewed chemistry textbook from atomic structure up. Great for ZIMSEC/Cambridge O-Level.", free:true,
    topics:["Atomic Theory","Electron Configuration","Bonding","Reactions","Thermochemistry","Equilibrium"], readerType:"pdf",
    url:"https://assets.openstax.org/oscms-prodcms/media/documents/ChemistryAtomsFirst2e-WEB.pdf" },
  { id:"sc6", subject:"Science", icon:"🌱", color:"rgba(52,211,153,0.08)", border:"rgba(52,211,153,0.25)", textColor:"#6ee7b7",
    title:"ZIMSEC Combined Science Study Guide", author:"ZIMSEC",
    desc:"Study guide for combined science covering physics, chemistry, and biology in the ZIMSEC syllabus.", free:false,
    topics:["Physics","Chemistry","Biology","Practical Work","Past Paper Questions"], readerType:"ai",
    url:"https://www.zimsec.co.zw/" },
];

const GENERAL_SUBJECTS = ["All", "English", "Science"];

// ── In-app reader for GenBook ─────────────────────────────────────────────────

const STUDY_GUIDE_SYSTEM_GEN = `You are a helpful tutor for ZIMSEC and Cambridge O-Level students in Zimbabwe.
Generate a comprehensive, structured study guide for the given textbook.
Format the guide with:
- A brief overview of the book and why it matters
- Chapter-by-chapter breakdown of key topics
- Key definitions, rules, and things to memorize
- Practice exercises or questions for each section
- Exam tips relevant to ZIMSEC/Cambridge O-Level students
Be detailed, practical, and student-friendly.`;

function GenBookReader({ book, onClose }: { book: GenBook; onClose: () => void }) {
  const [aiStarted, setAiStarted] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const BASE_URL = import.meta.env.BASE_URL ?? "/";
  function apiUrl(p: string) { return `${BASE_URL}api${p}`; }

  const runAi = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setAiText(""); setAiLoading(true); setAiStarted(true);
    try {
      const res = await fetch(apiUrl("/open-assist"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ system: STUDY_GUIDE_SYSTEM_GEN, message: `Generate a comprehensive study guide for "${book.title}" by ${book.author}. Topics: ${book.topics.join(", ")}.`, model: "qwen/qwen3.5-122b-a10b" }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error("AI unavailable");
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { const d = JSON.parse(line.slice(6)) as { delta?: string }; if (d.delta) setAiText(p => p + d.delta); } catch {}
        }
      }
    } catch {}
    setAiLoading(false);
  }, [book]);

  const isEmbedded = book.readerType !== "ai";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col" style={{ background: "#07090f" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
        <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-white hover:bg-white/10 transition-all shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-xl shrink-0">{book.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{book.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">by {book.author}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isEmbedded && (
            <a href={book.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs border border-white/15 text-muted-foreground hover:text-white transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
              <ExternalLink className="w-3 h-3" /> Open tab
            </a>
          )}
          <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden relative">
        {isEmbedded && !frameError && (
          <>
            {!frameLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                <p className="text-sm">Loading…</p>
              </div>
            )}
            <iframe src={book.url} className="w-full h-full border-0" title={book.title}
              onLoad={() => setFrameLoaded(true)} onError={() => setFrameError(true)}
              style={{ display: frameLoaded ? "block" : "none" }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
          </>
        )}
        {isEmbedded && frameError && (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
            <p className="text-white font-semibold">Couldn't embed this content</p>
            <p className="text-sm text-muted-foreground max-w-sm">The publisher blocked embedded viewing. Open it in a new tab instead.</p>
            <a href={book.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)" }}>
              <ExternalLink className="w-4 h-4" /> Open in New Tab
            </a>
            <button onClick={runAi}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-indigo-300 border border-indigo-500/30" style={{ background: "rgba(99,102,241,0.1)" }}>
              <Sparkles className="w-4 h-4" /> Get AI Study Guide instead
            </button>
          </div>
        )}
        {(book.readerType === "ai" || (frameError && aiStarted)) && (
          <div className="h-full overflow-y-auto p-5 space-y-4 max-w-3xl mx-auto">
            {!aiStarted ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center">
                <div className="text-5xl">{book.icon}</div>
                <div className="space-y-2">
                  <p className="text-xl font-bold text-white">{book.title}</p>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{book.desc}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {book.topics.map(t => <span key={t} className="px-2.5 py-1 rounded-lg text-xs text-white/60 bg-white/8 border border-white/10">{t}</span>)}
                </div>
                <div className="flex flex-col items-center gap-2.5">
                  <button onClick={runAi}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white hover:scale-[1.02] transition-all"
                    style={{ background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)" }}>
                    <Sparkles className="w-5 h-5" /> Generate AI Study Guide
                  </button>
                  {!book.free && (
                    <a href={book.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <ArrowUpRight className="w-3.5 h-3.5" /> Visit Official Page
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 pb-8">
                <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                  <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">AI Study Guide</p>
                    <p className="text-xs text-muted-foreground">{book.title}</p>
                  </div>
                  {aiLoading && <div className="ml-auto flex items-center gap-1.5 text-xs text-indigo-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</div>}
                  {!aiLoading && aiText && (
                    <button onClick={runAi} className="ml-auto text-xs text-muted-foreground hover:text-white flex items-center gap-1 transition-colors">
                      <Sparkles className="w-3 h-3" /> Regenerate
                    </button>
                  )}
                </div>
                {aiText ? (
                  <div className="space-y-1.5">
                    {aiText.split("\n").map((line, i) => {
                      if (!line.trim()) return <div key={i} className="h-1" />;
                      if (line.startsWith("### ")) return <p key={i} className="font-bold text-white mt-3 mb-1">{line.slice(4)}</p>;
                      if (line.startsWith("## ")) return <p key={i} className="text-base font-bold text-white mt-4 mb-1.5">{line.slice(3)}</p>;
                      if (line.startsWith("# ")) return <p key={i} className="text-lg font-black text-white mt-5 mb-2">{line.slice(2)}</p>;
                      if (line.startsWith("- ") || line.startsWith("* ")) return <p key={i} className="text-sm text-slate-300 flex gap-1.5 pl-2"><span className="text-indigo-400 shrink-0 mt-0.5">▸</span>{line.slice(2)}</p>;
                      const parts = line.split(/\*\*([^*]+)\*\*/g);
                      return <p key={i} className="text-sm text-slate-300 leading-relaxed">{parts.map((p, k) => k % 2 === 1 ? <strong key={k} className="text-white">{p}</strong> : p)}</p>;
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-indigo-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Generating your study guide…</span></div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GeneralBooksSection() {
  const [subj, setSubj] = useState("All");
  const [search, setSearch] = useState("");
  const [visCount, setVisCount] = useState(6);
  const [openBook, setOpenBook] = useState<GenBook | null>(null);

  const filtered = GENERAL_BOOKS.filter(b => {
    const sOk = subj === "All" || b.subject === subj;
    const q = search.toLowerCase();
    return sOk && (!q || b.title.toLowerCase().includes(q) || b.desc.toLowerCase().includes(q) || b.topics.some(t => t.toLowerCase().includes(q)));
  });

  const btnLabel = (b: GenBook) => b.readerType === "pdf" ? "Read PDF" : b.readerType === "html" ? "Open Reader" : "Study Guide";

  return (
    <>
      <AnimatePresence>
        {openBook && <GenBookReader book={openBook} onClose={() => setOpenBook(null)} />}
      </AnimatePresence>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-lg">📚</span>
          <p className="text-sm font-semibold text-white">English & Science Books</p>
          <span className="text-xs text-muted-foreground">{GENERAL_BOOKS.length} curated resources</span>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {GENERAL_SUBJECTS.map(s => (
            <button key={s} onClick={() => setSubj(s)}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all", subj === s ? "text-white border-yellow-500/50 bg-yellow-500/15" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white")}>
              {s}
            </button>
          ))}
          <div className="relative ml-2 flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-white/20 transition-colors placeholder:text-muted-foreground/60" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.slice(0, visCount).map(b => (
            <div key={b.id} className="rounded-2xl p-4 space-y-2.5 flex flex-col" style={{ background: b.color, border: `1px solid ${b.border}` }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">{b.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: b.textColor }}>{b.subject}</p>
                  <p className="text-sm font-bold text-white line-clamp-2">{b.title}</p>
                  <p className="text-xs text-muted-foreground">by {b.author}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{b.desc}</p>
              <div className="flex flex-wrap gap-1">
                {b.topics.slice(0,3).map(t => <span key={t} className="px-1.5 py-0.5 rounded text-[10px] text-white/50 bg-white/6">{t}</span>)}
              </div>
              <div className="flex items-center gap-2 mt-auto pt-1">
                {b.free && <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10">FREE</span>}
                <button onClick={() => setOpenBook(b)}
                  className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: `${b.border.replace("0.25","0.3")}`, border: `1px solid ${b.border}` }}>
                  <BookOpen className="w-3 h-3" /> {btnLabel(b)}
                </button>
              </div>
            </div>
          ))}
        </div>
        {visCount < filtered.length && (
          <div className="flex justify-center">
            <button onClick={() => setVisCount(v => v + 4)}
              className="px-5 py-2.5 rounded-xl text-sm text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-all">
              Load More
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OpenEdxTab() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="rounded-2xl p-5 flex items-start gap-4" style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(99,102,241,0.06))", border: "1px solid rgba(251,191,36,0.2)" }}>
        <div className="p-3 rounded-2xl text-2xl shrink-0" style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.35)" }}>🎓</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-display font-black text-white">Open edX — Study Resources</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Dictionary lookup, English language books, and free Science textbooks — all readable inside the app. Powered by Open edX's open-learning spirit.
          </p>
        </div>
      </div>

      {/* Dictionary widget */}
      <DictionaryWidget />

      {/* Platform stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Globe, value: "50M+", label: "Global Learners", color: "#60a5fa" },
          { icon: BookOpen, value: "3,500+", label: "Courses Worldwide", color: "#34d399" },
          { icon: GraduationCap, value: "160+", label: "Partner Institutions", color: "#a78bfa" },
          { icon: Award, value: "Open Source", label: "Apache 2.0 Licence", color: "#fbbf24" },
        ].map(({ icon: Icon, value, label, color }) => (
          <div key={label} className="p-4 rounded-2xl flex items-center gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Icon className="w-5 h-5 shrink-0" style={{ color }} />
            <div>
              <p className="text-lg font-display font-bold text-white">{value}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* English & Science Books — main content */}
      <GeneralBooksSection />

    </motion.div>
  );
}
