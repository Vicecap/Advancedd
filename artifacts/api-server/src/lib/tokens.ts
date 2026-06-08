import type { Request, Response, NextFunction } from "express";
import { db, anonymousTokensTable, tokenBalancesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logSecurityEvent } from "./security";

export const AUTH_WEEKLY_ALLOWANCE = 60_000;
export const GUEST_WEEKLY_ALLOWANCE = 20_000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getGuestId(req: Request): string {
  const raw = req.cookies?.guest_id || req.headers["x-guest-id"] || req.headers["x-device-id"];
  if (typeof raw === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(raw)) return raw;
  const ip = ((req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown").slice(0, 80);
  const ua = ((req.headers["user-agent"] as string | undefined) || "unknown").slice(0, 160);
  return `ip:${ip}:ua:${Buffer.from(ua).toString("base64url").slice(0, 40)}`;
}

export async function getOrCreateUserBalance(userId: string) {
  const [existing] = await db.select().from(tokenBalancesTable).where(eq(tokenBalancesTable.userId, userId));
  if (!existing) {
    const [created] = await db.insert(tokenBalancesTable).values({ userId, balance: AUTH_WEEKLY_ALLOWANCE, lastRefillAt: new Date() }).onConflictDoNothing().returning();
    return created ?? (await db.select().from(tokenBalancesTable).where(eq(tokenBalancesTable.userId, userId)))[0] ?? null;
  }
  if (Date.now() - existing.lastRefillAt.getTime() >= ONE_WEEK_MS) {
    const [updated] = await db.update(tokenBalancesTable).set({ balance: sql`GREATEST(${tokenBalancesTable.balance}, ${AUTH_WEEKLY_ALLOWANCE})`, lastRefillAt: new Date() }).where(eq(tokenBalancesTable.userId, userId)).returning();
    return updated;
  }
  return existing;
}

export async function getOrCreateGuestBalance(deviceId: string) {
  const [existing] = await db.select().from(anonymousTokensTable).where(eq(anonymousTokensTable.deviceId, deviceId));
  if (!existing) {
    const [created] = await db.insert(anonymousTokensTable).values({ deviceId, balance: GUEST_WEEKLY_ALLOWANCE, lastRefillAt: new Date() }).onConflictDoNothing().returning();
    return created ?? (await db.select().from(anonymousTokensTable).where(eq(anonymousTokensTable.deviceId, deviceId)))[0] ?? null;
  }
  if (Date.now() - existing.lastRefillAt.getTime() >= ONE_WEEK_MS) {
    const [updated] = await db.update(anonymousTokensTable).set({ balance: GUEST_WEEKLY_ALLOWANCE, lastRefillAt: new Date() }).where(eq(anonymousTokensTable.deviceId, deviceId)).returning();
    return updated;
  }
  return existing;
}

export async function deductTokens(req: Request, cost: number): Promise<{ ok: true; balance: number } | { ok: false; status: number; error: string; balance?: number }> {
  const safeCost = Math.max(1, Math.min(Math.floor(cost), 500_000));
  if (req.isAuthenticated?.() && req.user?.id) {
    const row = await getOrCreateUserBalance(req.user.id);
    if (!row || row.balance < safeCost) {
      void logSecurityEvent(req, "token_depleted", "medium", req.user.id, "Token balance depleted", { cost: safeCost, balance: row?.balance ?? 0 });
      return { ok: false, status: 402, error: "Insufficient tokens. Purchase more tokens or wait for the weekly reset.", balance: row?.balance ?? 0 };
    }
    const [updated] = await db.update(tokenBalancesTable).set({ balance: sql`${tokenBalancesTable.balance} - ${safeCost}`, totalUsed: sql`${tokenBalancesTable.totalUsed} + ${safeCost}` }).where(sql`${tokenBalancesTable.userId} = ${req.user.id} AND ${tokenBalancesTable.balance} >= ${safeCost}`).returning({ balance: tokenBalancesTable.balance });
    if (!updated) return { ok: false, status: 402, error: "Insufficient tokens.", balance: row.balance };
    return { ok: true, balance: updated.balance };
  }
  const guestId = getGuestId(req);
  const row = await getOrCreateGuestBalance(guestId);
  if (!row || row.balance < safeCost) {
    void logSecurityEvent(req, "guest_token_depleted", "medium", null, "Guest quota depleted", { cost: safeCost, balance: row?.balance ?? 0 });
    return { ok: false, status: 402, error: "Guest AI quota depleted. Sign in or wait for the weekly reset.", balance: row?.balance ?? 0 };
  }
  const [updated] = await db.update(anonymousTokensTable).set({ balance: sql`${anonymousTokensTable.balance} - ${safeCost}` }).where(sql`${anonymousTokensTable.deviceId} = ${guestId} AND ${anonymousTokensTable.balance} >= ${safeCost}`).returning({ balance: anonymousTokensTable.balance });
  if (!updated) return { ok: false, status: 402, error: "Guest quota depleted.", balance: row.balance };
  return { ok: true, balance: updated.balance };
}

export function requireTokens(cost: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await deductTokens(req, cost);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error, balance: result.balance });
      return;
    }
    res.locals.tokenBalance = result.balance;
    next();
  };
}
