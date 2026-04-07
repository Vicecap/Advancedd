import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Trophy, Star, Zap, Gift, X, CheckCircle } from "lucide-react";
import { useStreak, type Milestone } from "@/hooks/use-streak";
import { useNotifications } from "@/hooks/use-notifications";

const MILESTONE_COLORS: Record<number, { bg: string; border: string; text: string; glow: string }> = {
  3:   { bg: "rgba(251,146,60,0.12)",  border: "rgba(251,146,60,0.35)",  text: "text-orange-400",  glow: "rgba(251,146,60,0.4)"  },
  7:   { bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.35)",  text: "text-indigo-400",  glow: "rgba(99,102,241,0.4)"  },
  14:  { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)",  text: "text-emerald-400", glow: "rgba(16,185,129,0.4)"  },
  30:  { bg: "rgba(139,92,246,0.12)",  border: "rgba(139,92,246,0.35)",  text: "text-violet-400",  glow: "rgba(139,92,246,0.4)"  },
  60:  { bg: "rgba(236,72,153,0.12)",  border: "rgba(236,72,153,0.35)",  text: "text-pink-400",    glow: "rgba(236,72,153,0.4)"  },
  100: { bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)",  text: "text-amber-400",   glow: "rgba(245,158,11,0.4)"  },
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

interface MilestoneToastProps {
  milestones: Milestone[];
  onClose: () => void;
}

export function MilestoneToast({ milestones, onClose }: MilestoneToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <AnimatePresence>
      {milestones.map((m, i) => {
        const col = MILESTONE_COLORS[m.days] ?? MILESTONE_COLORS[30];
        return (
          <motion.div
            key={m.days}
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            transition={{ delay: i * 0.15, type: "spring", stiffness: 300, damping: 24 }}
            className="fixed bottom-4 right-4 z-[999] flex items-start gap-3 p-4 rounded-2xl shadow-2xl max-w-sm"
            style={{ background: col.bg, border: `1px solid ${col.border}`, boxShadow: `0 8px 32px ${col.glow}` }}
          >
            <div className="p-2 rounded-xl" style={{ background: col.border }}>
              <Gift className={`w-5 h-5 ${col.text}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${col.text}`}>🎉 Milestone Unlocked!</p>
              <p className="text-white text-xs font-semibold mt-0.5">{m.badge}</p>
              <p className="text-muted-foreground text-xs mt-1">+{fmt(m.tokens)} tokens awarded</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-white transition-colors mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

export function StreakCard() {
  const { streak, milestones, loading, newMilestones, clearNewMilestones } = useStreak();
  const { permission, requestPermission, notify } = useNotifications();

  useEffect(() => {
    if (newMilestones.length > 0) {
      newMilestones.forEach(m => {
        notify(`🏆 ${m.badge} Unlocked!`, {
          body: `${m.days}-day streak reached! +${fmt(m.tokens)} bonus tokens added.`,
          tag: `streak-${m.days}`,
        });
      });
    }
  }, [newMilestones, notify]);

  const current = streak?.currentStreak ?? 0;
  const best = streak?.bestStreak ?? 0;
  const claimed = streak?.claimedMilestones ?? [];
  const nextMilestone = milestones.find(m => current < m.days);
  const progress = nextMilestone ? Math.min((current / nextMilestone.days) * 100, 100) : 100;

  if (!streak && !loading) return null;

  return (
    <>
      <MilestoneToast milestones={newMilestones} onClose={clearNewMilestones} />

      <div className="rounded-2xl p-4 space-y-4"
        style={{ background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.2)" }}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl" style={{ background: "rgba(251,146,60,0.2)", border: "1px solid rgba(251,146,60,0.35)" }}>
              <Flame className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Daily Streak</p>
              <p className="text-[10px] text-muted-foreground">Keep learning every day</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-display font-black text-orange-400">{current}</p>
            <p className="text-[10px] text-muted-foreground">day{current !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Progress to next milestone */}
        {nextMilestone && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Next: {nextMilestone.label}</p>
              <p className="text-[10px] text-orange-400 font-semibold">+{fmt(nextMilestone.tokens)} tokens</p>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #f97316, #fb923c)" }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-right">
              {current}/{nextMilestone.days} days
            </p>
          </div>
        )}

        {!nextMilestone && (
          <div className="text-center py-1">
            <p className="text-xs text-amber-400 font-semibold">All milestones claimed! 🏆</p>
          </div>
        )}

        {/* Best streak */}
        {best > 0 && (
          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <p className="text-[11px] text-muted-foreground">Best Streak</p>
            </div>
            <p className="text-[11px] font-bold text-amber-400">{best} days</p>
          </div>
        )}

        {/* Milestones grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {milestones.slice(0, 6).map(m => {
            const col = MILESTONE_COLORS[m.days] ?? MILESTONE_COLORS[30];
            const isClaimed = claimed.includes(m.days);
            const isNext = m === nextMilestone;
            return (
              <motion.div
                key={m.days}
                whileHover={{ scale: 1.04 }}
                className="relative flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
                style={{
                  background: isClaimed ? col.bg : isNext ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isClaimed ? col.border : isNext ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
                  opacity: current < m.days && !isClaimed ? 0.55 : 1,
                }}
              >
                {isClaimed && (
                  <div className="absolute -top-1 -right-1">
                    <CheckCircle className={`w-3 h-3 ${col.text}`} fill="currentColor" />
                  </div>
                )}
                <div className={`text-xs font-black ${isClaimed ? col.text : isNext ? "text-white/70" : "text-muted-foreground"}`}>
                  {m.days}d
                </div>
                <div className={`text-[9px] ${isClaimed ? col.text : "text-muted-foreground"} opacity-80 text-center leading-tight`}>
                  +{fmt(m.tokens)}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Notification permission */}
        {permission === "default" && (
          <button
            onClick={requestPermission}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-semibold text-orange-300 transition-all hover:text-orange-200"
            style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)" }}
          >
            <Zap className="w-3 h-3" />
            Enable streak notifications
          </button>
        )}
        {permission === "granted" && (
          <div className="flex items-center justify-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-emerald-400">Notifications enabled</span>
          </div>
        )}
      </div>
    </>
  );
}
