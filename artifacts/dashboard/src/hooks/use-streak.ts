import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./use-auth";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

export interface Milestone {
  days: number;
  label: string;
  tokens: number;
  badge: string;
}

export interface StreakData {
  userId: string;
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string | null;
  claimedMilestones: number[];
  updatedAt: string;
}

export interface UseStreakReturn {
  streak: StreakData | null;
  milestones: Milestone[];
  loading: boolean;
  newMilestones: Milestone[];
  clearNewMilestones: () => void;
  checkin: () => Promise<void>;
}

export function useStreak(): UseStreakReturn {
  const { isAuthenticated } = useAuth();
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMilestones, setNewMilestones] = useState<Milestone[]>([]);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch(api("/streak"), { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { streak: StreakData; milestones: Milestone[] };
        setStreak(d.streak);
        setMilestones(d.milestones);
      }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  const checkin = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(api("/streak/checkin"), {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const d = await res.json() as { streak: StreakData; milestones: Milestone[]; newMilestones: Milestone[] };
        setStreak(d.streak);
        setMilestones(d.milestones);
        if (d.newMilestones.length > 0) {
          setNewMilestones(d.newMilestones);
        }
      }
    } catch {}
  }, [isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isAuthenticated) {
      checkin();
    }
  }, [isAuthenticated, checkin]);

  return {
    streak,
    milestones,
    loading,
    newMilestones,
    clearNewMilestones: () => setNewMilestones([]),
    checkin,
  };
}
