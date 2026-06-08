import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  authProvider: string;
  isPremium?: boolean;
}

export interface TokenInfo {
  balance: number;
  totalUsed: number;
  nextRefillAt: string;
  weeklyAllowance: number;
}

const WEEKLY_ALLOWANCE = 60_000;

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  tokens: TokenInfo | null;
  logout: () => Promise<void>;
  deductToken: (cost?: number) => Promise<boolean>;
  deductPdfToken: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
  refreshTokens: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokens, setTokens] = useState<TokenInfo | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/user", { credentials: "include" });
      const data = await r.json() as { user: AuthUser | null };
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const refreshTokens = useCallback(async () => {
    if (!user) { setTokens(null); return; }
    try {
      const r = await fetch("/api/tokens/balance", { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json() as { authenticated: boolean } & Partial<TokenInfo>;
      if (data.authenticated && data.balance != null) {
        setTokens({
          balance: data.balance,
          totalUsed: data.totalUsed ?? 0,
          nextRefillAt: data.nextRefillAt ?? "",
          weeklyAllowance: data.weeklyAllowance ?? WEEKLY_ALLOWANCE,
        });
      }
    } catch {}
  }, [user]);

  useEffect(() => { refreshTokens(); }, [refreshTokens]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setTokens(null);
  }, []);

  const deductToken = useCallback(async (cost = 10_000): Promise<boolean> => {
    if (!user) return true;
    try {
      const r = await fetch("/api/tokens/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost }),
        credentials: "include",
      });
      const data = await r.json() as { deducted?: boolean; balance?: number; totalUsed?: number };
      if (r.ok && data.deducted) {
        setTokens((prev) => prev ? { ...prev, balance: data.balance!, totalUsed: data.totalUsed! } : prev);
        return true;
      }
      if (r.status === 402) {
        setTokens((prev) => prev ? { ...prev, balance: 0 } : prev);
      }
    } catch {}
    return false;
  }, [user]);

  const deductPdfToken = useCallback(async (): Promise<boolean> => {
    return deductToken(1_000);
  }, [deductToken]);

  return { user, isLoading, isAuthenticated: !!user, tokens, logout, deductToken, deductPdfToken, refreshUser, refreshTokens };
}
