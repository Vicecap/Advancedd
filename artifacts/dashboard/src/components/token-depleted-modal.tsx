import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ShoppingBag, Clock, Lock, Cpu } from "lucide-react";

interface TokenDepletedModalProps {
  open: boolean;
  nextRefillAt: string | null;
  onBuyTokens: () => void;
  onDismiss: () => void;
  onUseFreeModels?: () => void;
}

export default function TokenDepletedModal({ open, nextRefillAt, onBuyTokens, onDismiss, onUseFreeModels }: TokenDepletedModalProps) {
  const refillDate = nextRefillAt
    ? new Date(nextRefillAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={onDismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: "linear-gradient(160deg, #0f1117 60%, rgba(239,68,68,0.08))", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #ef4444, #f97316, #eab308)" }} />

            <div className="p-7 flex flex-col items-center text-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(239,68,68,0.12)", border: "2px solid rgba(239,68,68,0.3)" }}>
                  <Zap className="w-7 h-7 text-red-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0f1117] flex items-center justify-center"
                  style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
                  <Lock className="w-3.5 h-3.5 text-red-400" />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-display font-black text-white">Tokens Depleted</h2>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Your weekly 60K token allowance has been used up. Buy more tokens to continue using
                  <span className="text-amber-400 font-medium"> deep thinking fast models</span> and PDF reading.
                </p>
              </div>

              {refillDate && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl w-full"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="text-[11px] text-muted-foreground">Free weekly reset on</p>
                    <p className="text-sm font-semibold text-white">{refillDate}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={onBuyTokens}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all hover:brightness-110"
                  style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.3))", border: "1px solid rgba(99,102,241,0.5)", color: "#c4b5fd" }}
                >
                  <ShoppingBag className="w-4 h-4" />
                  Buy More Tokens (PayPal / Bitcoin)
                </button>
                <button
                  onClick={() => { onDismiss(); onUseFreeModels?.(); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#6ee7b7" }}
                >
                  <Cpu className="w-4 h-4" />
                  Use Free Models Instead
                </button>
                <button
                  onClick={onDismiss}
                  className="w-full py-2 rounded-xl text-xs text-muted-foreground hover:text-white border border-white/8 hover:bg-white/5 transition-all"
                >
                  Dismiss — wait for weekly reset
                </button>
              </div>

              <p className="text-[10px] text-muted-foreground/50">
                60K free tokens reset every 7 days · Free models always available
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
