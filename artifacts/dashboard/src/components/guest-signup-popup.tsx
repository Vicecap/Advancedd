import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, UserPlus, LogIn } from "lucide-react";

interface GuestSignUpPopupProps {
  open: boolean;
  onClose: () => void;
  onOpenAuth: () => void;
  reason?: "tokens" | "pdf" | "feature";
}

const MESSAGES = {
  tokens: {
    title: "Weekly guest tokens used up",
    body: "You've reached the 100K weekly guest token limit. Sign up for free to get 600K tokens per week and save your history.",
  },
  pdf: {
    title: "Sign in to read PDFs",
    body: "Create a free account or sign in to access study materials, past papers, and more.",
  },
  feature: {
    title: "Sign in to continue",
    body: "Create a free account or sign in to unlock all features.",
  },
};

export default function GuestSignUpPopup({ open, onClose, onOpenAuth, reason = "tokens" }: GuestSignUpPopupProps) {
  const msg = MESSAGES[reason];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: "linear-gradient(145deg, #0f1129, #151932)", border: "1px solid rgba(167,139,250,0.25)" }}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(167,139,250,0.15))", border: "1px solid rgba(167,139,250,0.3)" }}>
                <Zap className="w-7 h-7 text-violet-400" />
              </div>

              <h2 className="text-lg font-bold text-white mb-2">{msg.title}</h2>
              <p className="text-sm text-white/60 leading-relaxed mb-6">{msg.body}</p>

              <div className="space-y-2.5">
                <button
                  onClick={() => { onClose(); onOpenAuth(); }}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
                >
                  <UserPlus className="w-4 h-4" />
                  Create free account
                </button>
                <button
                  onClick={() => { onClose(); onOpenAuth(); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-sm text-white/70 hover:text-white transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  <LogIn className="w-4 h-4" />
                  Already have an account? Sign in
                </button>
              </div>

              {reason === "tokens" && (
                <p className="mt-4 text-[11px] text-white/30">
                  Free tier: 100K tokens/week &nbsp;·&nbsp; Signed up: 600K tokens/week
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
