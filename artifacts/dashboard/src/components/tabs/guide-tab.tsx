import React from "react";
import {
  Brain, Camera, LineChart, Calculator, MessageSquare,
  GraduationCap, Library, BookOpen, Sparkles, History,
  Globe, ClipboardList, SplitSquareVertical, Bot, FileText,
  ScrollText, LayoutList, Search,
} from "lucide-react";
import { motion } from "framer-motion";

const FEATURES = [
  {
    icon: Globe,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    title: "Mathematics Solver Hub",
    tab: "Mathematics Solver Hub",
    desc: "The main solver powered by real Python maths libraries (Newton API, MathJS, SymPy). Get exact symbolic and numeric answers for algebra, calculus, derivatives, integrals, and more.",
    tips: [
      "Choose an operation (Simplify, Factor, Derive, Integrate…) then enter your expression",
      "Switch between Newton API and MathJS for different problem types",
      "AI can explain any result — enable the AI toggle for step-by-step commentary",
    ],
  },
  {
    icon: Brain,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    title: "Mathematics Solver Hub 2",
    tab: "Mathematics Solver Hub 2",
    desc: "AI-powered solver for any maths question — type it in plain English. Great for word problems, multi-step reasoning, or when you want a fully explained solution with working shown.",
    tips: [
      "Try: solve 2x + 3 = 7 step by step",
      "Try: What is the integral of x² dx?",
      "Select a model (Qwen Fast → most questions, Qwen Powerful → complex proofs)",
    ],
  },
  {
    icon: Camera,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    title: "Image OCR",
    tab: "Image OCR",
    desc: "Upload or photograph a question from a textbook, worksheet, or exam paper. The app reads the text with OCR and sends it directly to the solver — no retyping needed.",
    tips: [
      "Works with printed text and reasonably clear handwriting",
      "Extracted text is automatically loaded into Mathematics Solver Hub 2",
    ],
  },
  {
    icon: Library,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
    title: "Study Library",
    tab: "Study Library",
    desc: "Browse 400+ ZIMSEC past papers, textbooks, and green books. Open any document in the built-in PDF reader — highlight text, ask the AI Tutor, and fill in answers with the Answer Sheet.",
    tips: [
      "Filter by subject, level (O-Level / A-Level), or category",
      "Highlight any text → click Ask AI for an instant explanation",
      "Answer Sheet: MCQ mode (up to 60 Qs) or Written/Essay mode (up to 15 Qs) — AI grades and gives feedback",
      "Select your preferred AI model in the AI Tutor panel header",
      "Upload your own resources to share with other students",
    ],
  },
  {
    icon: SplitSquareVertical,
    color: "text-teal-400",
    bg: "bg-teal-500/10 border-teal-500/20",
    title: "Mobile Split-Screen (Study Library)",
    tab: "Study Library → Answers",
    desc: "On mobile, tapping Answers opens a split-screen view: the PDF stays visible on top while the answer sheet appears below, so you can read questions and fill answers at the same time.",
    tips: [
      "Drag the handle between the panels up or down to resize",
      "Works for both MCQ and Written/Essay answer modes",
      "Tap the AI Tutor button to open the AI panel on top of the split view",
    ],
  },
  {
    icon: ClipboardList,
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    title: "Answer Sheet & AI Grading",
    tab: "Study Library → Answers",
    desc: "Fill in your MCQ or written answers while reading a paper. When you submit, the AI reads the full exam paper text and grades your answers — providing mark estimates, expected answers, and study tips.",
    tips: [
      "MCQ: tap A / B / C / D for each question",
      "Written/Essay: type your answers in the text boxes",
      "Switching modes automatically clamps the question count to the correct limit",
      "Feedback opens in the AI Tutor panel — check there after submitting",
    ],
  },
  {
    icon: MessageSquare,
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    title: "AI Chat",
    tab: "AI Chat",
    desc: "Have an open conversation with the AI tutor. Ask follow-up questions about solutions, explore topics in depth, or get help understanding a concept.",
    tips: [
      "Previous solve results are automatically included as context",
      "Ask 'Why?' or 'Show me a different method'",
    ],
  },
  {
    icon: GraduationCap,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    title: "Quiz Mode",
    tab: "Quiz",
    desc: "Test yourself with AI-generated questions on any maths topic. Get instant feedback and explanations for every answer.",
    tips: [
      "Choose a topic and difficulty level before starting",
      "Each answer reveals the explanation — great for self-study",
    ],
  },
  {
    icon: LineChart,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    title: "Graph Plotter",
    tab: "Graph",
    desc: "Visualise any function on an interactive graph. Perfect for understanding shapes of equations, transformations, and intersections.",
    tips: ["Try: y = x² - 4x + 3", "Try: sin(x) + cos(2x)"],
  },
  {
    icon: Calculator,
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    title: "Calculator",
    tab: "Calculator",
    desc: "A full scientific calculator for quick calculations during study. Supports trigonometry, logarithms, powers, and more.",
    tips: ["Use during exam practice for mental arithmetic checks"],
  },
  {
    icon: FileText,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    title: "Homework Help",
    tab: "Homework Help",
    desc: "Upload homework as a PDF, photo, or text file. Pick how you want help — step-by-step guidance, full solution, submission review, or topic research. The AI automatically searches 400+ library resources for relevant context.",
    tips: [
      "Drag & drop a PDF, image, or text file — text is extracted automatically",
      "Choose: Help Me Understand / Solve For Me / Review My Work / Research Topic",
      "Set the subject so the AI searches relevant textbooks and past papers",
      "Submit finished homework for review before handing it in to school",
    ],
  },
  {
    icon: ScrollText,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    title: "Notes & Green Books",
    tab: "Notes",
    desc: "Access hundreds of student notes and ZIMSEC green books sourced externally. Open any document in the built-in PDF reader — your last page is automatically remembered so you can resume reading any time.",
    tips: [
      "Green books are official ZIMSEC revision books — great for structured exam prep",
      "Notes come from student-compiled sources across all major O-Level subjects",
      "The reading position for each PDF is saved in your browser — it resumes where you left off",
      "Use the AI Resource Search at the top to find notes by topic across all sources",
    ],
  },
  {
    icon: LayoutList,
    color: "text-sky-400",
    bg: "bg-sky-500/10 border-sky-500/20",
    title: "Syllabus",
    tab: "Syllabus",
    desc: "Browse 67 ZIMSEC and Cambridge O-Level syllabi grouped by subject — Mathematics, Physics, Chemistry, Biology, Computer Science, Geography, History, Accounting, Business Studies, and more.",
    tips: [
      "Each card shows the subject, level (O-Level / A-Level), and source board",
      "Click any syllabus card to open it as a PDF — great for checking what topics are examinable",
      "Use the search at top to find syllabi for a specific subject or level quickly",
    ],
  },
  {
    icon: Library,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
    title: "Book Library (Novels & Books)",
    tab: "Book Library",
    desc: "Two sections in one tab: the Novels section has 180+ fiction and classic books with reading lists and genre filters; the Books section has 600+ self-help, business, and academic PDFs sourced externally.",
    tips: [
      "Toggle between Novels and Books using the pill at the top of the tab",
      "Your progress (last page) is saved automatically per book — tap a novel to resume reading",
      "Reading List tracks novels you've started or finished — mark finished, resume, or remove",
      "Books are searchable by title — click any card to open the PDF reader",
    ],
  },
  {
    icon: Search,
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    title: "AI Resource Search",
    tab: "Notes / Syllabus / Study Library / Book Library",
    desc: "A unified search that queries all external sources in parallel — external books, green books, notes, syllabi, and the study library — and lets you ask the AI a question about any result.",
    tips: [
      "Appears at the top of Notes, Syllabus, Study Library, and Book Library tabs",
      "Type a topic or subject to search across all 5 sources at once",
      "Click any result to open its PDF directly in the reader",
      "The 'Ask AI' button sends your query to the AI tutor for a guided explanation",
    ],
  },
  {
    icon: History,
    color: "text-slate-400",
    bg: "bg-slate-500/10 border-slate-500/20",
    title: "Solve History & Session Memory",
    tab: "Sidebar",
    desc: "The app remembers your last open tab — refreshing brings you straight back to where you were. Sign in to also save every problem you solve and review past sessions from your profile.",
    tips: [
      "Last tab is restored automatically on every page load",
      "Full solve history is saved per-account when signed in",
      "5 million tokens free every week for signed-in users",
    ],
  },
];

export default function GuideTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/5 border border-primary/20 p-5">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/20 text-primary border border-primary/30">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-white">How to Use the Platform</h2>
            <p className="text-sm text-muted-foreground">Everything you can do — all features explained</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-1.5 text-xs text-primary/70">
            <Sparkles className="w-3.5 h-3.5" />
            AI-powered
          </div>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FEATURES.map((f, idx) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className={`rounded-xl border p-4 ${f.bg}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-white/5 border border-white/10 shrink-0 ${f.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-bold text-white text-sm">{f.title}</h3>
                    <span className="text-xs text-muted-foreground/60 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{f.tab}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-2">{f.desc}</p>
                  <ul className="space-y-1">
                    {f.tips.map(tip => (
                      <li key={tip} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className={`mt-0.5 shrink-0 ${f.color}`}>›</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Quick start */}
      <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
        <h3 className="font-bold text-white mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Quick Start
        </h3>
        <ol className="space-y-2 text-sm text-slate-300">
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
            <span>Open <strong className="text-white">Mathematics Solver Hub</strong> — enter an expression, pick an operation, and get an exact answer from Python libraries.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
            <span>Open <strong className="text-white">Study Library</strong>, browse past papers, click a document to open it, and tap <strong className="text-white">Answers</strong> to open the split-screen answer sheet.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
            <span>Highlight any text in the PDF and click <strong className="text-white">Ask AI</strong> — the AI reads the full paper and gives a targeted explanation.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>
            <span><strong className="text-white">Sign in</strong> to save your history and get 5 million free tokens per week. Your last tab is always remembered, even without signing in.</span>
          </li>
        </ol>
      </div>

      {/* Disclaimer box */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <Bot className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-400 mb-1">Accuracy Notice</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Exact calculations (Mathematics Solver Hub) are performed by Python maths libraries and are reliable for standard operations.
              AI explanations (Hub 2, AI Chat, AI Tutor) generate natural-language responses which may occasionally contain errors — always verify critical answers independently, especially for high-stakes exams.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
