import React, { useState, useEffect, useMemo } from "react";
import { MessageSquare, Send, Copy, Sparkles, ChevronDown, Bot, Loader2, Cpu, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDiscuss, useAIModels, useFreeAIModels } from "@/hooks/use-math-api";
import { useAuth } from "@/hooks/use-auth";

interface ChatTabProps {
  previousSolution?: string;
}

export default function ChatTab({ previousSolution }: ChatTabProps) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [showSolution, setShowSolution] = useState(false);

  const { tokens, isAuthenticated } = useAuth();
  const isDepleted = !!tokens && tokens.balance <= 0;

  const { data: aiModels } = useAIModels();
  const { data: freeModels } = useFreeAIModels();

  const allModels = useMemo(() => {
    let premium = (aiModels?.models ?? []).map(m => ({ ...m, free: false as const }));
    if (!isAuthenticated) {
      premium = premium.filter(m => m.id === "qwen/qwen3.5-9b");
    }
    const free = (freeModels?.models ?? []).map(m => ({ ...m, free: true as const }));
    return [...premium, ...free];
  }, [aiModels, freeModels, isAuthenticated]);

  const isFreeModel = (id: string) => allModels.find(m => m.id === id)?.free ?? false;

  const endpoint = isFreeModel(model) ? "/api/discuss" : "/api/discuss";
  const { mutate: discuss, isPending, data, error } = useDiscuss(endpoint);

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

  const handleSend = () => {
    if (!prompt.trim()) return;
    discuss({ prompt, ai: model || (allModels[0]?.id ?? "") });
  };

  const handleLoadSolution = () => {
    if (previousSolution) {
      setPrompt(`Here is a previous AI solution:\n\n${previousSolution}\n\nPlease clarify or expand on: `);
    }
  };

  const selectedModelInfo = allModels.find(m => m.id === model);
  const isCurrentFree = selectedModelInfo?.free ?? false;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.08) 100%)", border: "1px solid rgba(59,130,246,0.25)" }}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl" style={{ background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.35)" }}>
            <MessageSquare className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display font-black text-white">AI Chat</h2>
            <p className="text-sm text-muted-foreground">Ask follow-up questions, clarify, or explore further</p>
          </div>
          {isDepleted && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#6ee7b7" }}>
              <Cpu className="w-3.5 h-3.5" /> Free AI active
            </div>
          )}
        </div>
      </div>

      {/* Previous solution banner */}
      <AnimatePresence>
        {previousSolution && (
          <motion.div key="prev-sol" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.4)" }}>
            <div className="flex items-center justify-between px-4 py-2.5 gap-3"
              style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.2), rgba(99,102,241,0.1))" }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
                <span className="text-sm font-semibold text-violet-200">Previous AI solution loaded</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowSolution(s => !s)}
                  className="text-xs text-violet-300 hover:text-white transition-all flex items-center gap-1 px-2 py-1 rounded-lg"
                  style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)" }}>
                  {showSolution ? "Hide" : "Preview"} <ChevronDown className={`w-3 h-3 transition-transform ${showSolution ? "rotate-180" : ""}`} />
                </button>
                <button onClick={handleLoadSolution}
                  className="text-xs text-white px-3 py-1 rounded-lg font-semibold transition-all hover:scale-[1.02] flex items-center gap-1.5"
                  style={{ background: "rgba(139,92,246,0.4)", border: "1px solid rgba(139,92,246,0.5)" }}>
                  <Copy className="w-3 h-3" /> Load into chat
                </button>
              </div>
            </div>
            <AnimatePresence>
              {showSolution && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="p-4 max-h-48 overflow-y-auto" style={{ background: "rgba(0,0,0,0.4)" }}>
                    <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">{previousSolution.slice(0, 800)}{previousSolution.length > 800 ? "…" : ""}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main card */}
      <div className="rounded-2xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Model select */}
        <div className="max-w-xs">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">AI Model</p>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm text-white focus:outline-none transition-all"
            style={{ background: "rgba(255,255,255,0.07)", border: isCurrentFree ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(255,255,255,0.12)" }}>
            {aiModels?.models && aiModels.models.length > 0 && (
              <optgroup label="⚡ Premium (10K tokens each)" style={{ background: "#0d0f1e" }}>
                {aiModels.models.map(m => (
                  <option key={m.id} value={m.id} disabled={isDepleted} className="bg-[#0d0f1e]">
                    {m.recommended ? `${m.label} ⭐` : m.label}{isDepleted ? " 🔒" : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {freeModels?.models && freeModels.models.length > 0 && (
              <optgroup label="✅ Free Models (always available)" style={{ background: "#0d0f1e" }}>
                {freeModels.models.map(m => (
                  <option key={m.id} value={m.id} className="bg-[#0d0f1e]">
                    {m.label} · Free
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {isCurrentFree && (
            <p className="text-[11px] mt-1" style={{ color: "#6ee7b7" }}>Free model — no tokens used</p>
          )}
          {isDepleted && !isCurrentFree && (
            <p className="text-[11px] mt-1 text-red-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Switch to a free model above</p>
          )}
        </div>

        {/* Message input */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Your message</p>
          <textarea
            placeholder="Ask a follow-up question, request a clearer explanation, try a different example…"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(); } }}
            className="w-full px-3 py-3 rounded-xl text-sm text-white focus:outline-none resize-none min-h-[120px]"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
          />
          <p className="text-xs text-muted-foreground mt-1">Press Ctrl+Enter to send</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={handleSend} disabled={!prompt.trim() || isPending || (isDepleted && !isCurrentFree)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{ background: isCurrentFree ? "linear-gradient(135deg, rgba(16,185,129,0.4), rgba(5,150,105,0.3))" : "linear-gradient(135deg, rgba(59,130,246,0.5), rgba(99,102,241,0.4))", border: isCurrentFree ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(59,130,246,0.5)" }}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : isCurrentFree ? <Cpu className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {isPending ? "Thinking…" : "Send"}
          </button>
          {!previousSolution && (
            <button disabled
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground border border-white/10 opacity-40 cursor-not-allowed"
              style={{ background: "rgba(255,255,255,0.03)" }}>
              <Copy className="w-4 h-4" /> No previous solution yet
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          Error: {error.message}
        </div>
      )}

      {/* Response */}
      <AnimatePresence>
        {(data?.response || isPending) && (
          <motion.div key="response" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden" style={{ border: isCurrentFree ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(59,130,246,0.25)" }}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ background: isCurrentFree ? "rgba(16,185,129,0.08)" : "rgba(59,130,246,0.08)", borderColor: isCurrentFree ? "rgba(16,185,129,0.2)" : "rgba(59,130,246,0.2)" }}>
              {isCurrentFree ? <Cpu className="w-3.5 h-3.5 text-emerald-400" /> : <Bot className="w-3.5 h-3.5 text-blue-400" />}
              <span className={`text-xs font-semibold ${isCurrentFree ? "text-emerald-300" : "text-blue-300"}`}>
                {isCurrentFree ? "Free AI Response" : "AI Response"}
              </span>
            </div>
            <div className="p-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap min-h-[80px]" style={{ background: "rgba(0,0,0,0.3)" }}>
              {isPending
                ? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />AI is thinking…</span>
                : data?.response}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
