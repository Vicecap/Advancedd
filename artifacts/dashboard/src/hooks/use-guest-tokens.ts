import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "guest_tokens_v2";
const DEVICE_ID_KEY = "guest_device_id";
const WEEKLY_ALLOWANCE = 20_000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

export interface GuestTokenState {
  balance: number;
  resetAt: number;
  totalUsed: number;
}

function loadState(): GuestTokenState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuestTokenState;
      if (Date.now() >= parsed.resetAt) {
        const fresh: GuestTokenState = { balance: WEEKLY_ALLOWANCE, resetAt: Date.now() + ONE_WEEK_MS, totalUsed: 0 };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        return fresh;
      }
      return parsed;
    }
  } catch {}
  const fresh: GuestTokenState = { balance: WEEKLY_ALLOWANCE, resetAt: Date.now() + ONE_WEEK_MS, totalUsed: 0 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveState(state: GuestTokenState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export interface UseGuestTokens {
  balance: number;
  totalUsed: number;
  weeklyAllowance: number;
  pct: number;
  resetAt: number;
  depleted: boolean;
  deduct: (amount?: number) => Promise<boolean>;
  reset: () => void;
  deviceId: string;
}

export function useGuestTokens(enabled: boolean): UseGuestTokens {
  const [state, setState] = useState<GuestTokenState>(() => loadState());
  const deviceId = useRef(getOrCreateDeviceId());
  const synced = useRef(false);

  useEffect(() => {
    if (!enabled || synced.current) return;
    synced.current = true;
    fetch(`${api("/guest/balance")}?deviceId=${encodeURIComponent(deviceId.current)}`)
      .then(r => r.json())
      .then((data: { balance: number; resetAt: number }) => {
        if (typeof data.balance === "number") {
          const local = loadState();
          const serverBalance = data.balance;
          const resetAt = data.resetAt ?? (Date.now() + ONE_WEEK_MS);
          const newState: GuestTokenState = {
            balance: Math.min(serverBalance, local.balance),
            resetAt,
            totalUsed: WEEKLY_ALLOWANCE - Math.min(serverBalance, local.balance),
          };
          saveState(newState);
          setState(newState);
        }
      })
      .catch(() => {});
  }, [enabled]);

  const deduct = useCallback(async (amount = 10_000): Promise<boolean> => {
    if (!enabled) return true;
    const current = loadState();
    if (current.balance <= 0) return false;
    const optimisticBalance = Math.max(0, current.balance - amount);
    const optimistic: GuestTokenState = {
      balance: optimisticBalance,
      resetAt: current.resetAt,
      totalUsed: current.totalUsed + amount,
    };
    saveState(optimistic);
    setState(optimistic);
    try {
      const res = await fetch(api("/guest/deduct"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceId.current, amount }),
      });
      const data = await res.json() as { success: boolean; balance: number; depleted: boolean };
      const serverState: GuestTokenState = {
        balance: data.balance,
        resetAt: current.resetAt,
        totalUsed: WEEKLY_ALLOWANCE - data.balance,
      };
      saveState(serverState);
      setState(serverState);
      return data.success;
    } catch {
      return optimisticBalance > 0;
    }
  }, [enabled]);

  const reset = useCallback(() => {
    const fresh: GuestTokenState = { balance: WEEKLY_ALLOWANCE, resetAt: Date.now() + ONE_WEEK_MS, totalUsed: 0 };
    saveState(fresh);
    setState(fresh);
  }, []);

  return {
    balance: state.balance,
    totalUsed: state.totalUsed,
    weeklyAllowance: WEEKLY_ALLOWANCE,
    pct: Math.min(100, (state.balance / WEEKLY_ALLOWANCE) * 100),
    resetAt: state.resetAt,
    depleted: state.balance <= 0,
    deduct,
    reset,
    deviceId: deviceId.current,
  };
}
