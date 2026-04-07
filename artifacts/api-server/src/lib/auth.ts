import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, sessionsTable, usersTable, tokenBalancesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  authProvider: string;
  isAdmin: boolean;
  isPremium: boolean;
  emailVerified: boolean;
}

export interface SessionData {
  user: AuthUser;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }
  return row.sess as unknown as SessionData;
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(res: Response, sid?: string): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return req.cookies?.[SESSION_COOKIE];
}

export function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function provisionUser(user: {
  id?: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  passwordHash?: string | null;
  googleId?: string | null;
  authProvider: string;
}): Promise<AuthUser> {
  const [saved] = await db
    .insert(usersTable)
    .values({
      ...(user.id ? { id: user.id } : {}),
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profileImageUrl: user.profileImageUrl ?? null,
      passwordHash: user.passwordHash ?? null,
      googleId: user.googleId ?? null,
      authProvider: user.authProvider,
    })
    .onConflictDoUpdate({
      target: user.googleId ? usersTable.googleId : usersTable.email,
      set: {
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        profileImageUrl: user.profileImageUrl ?? undefined,
        updatedAt: new Date(),
      },
    })
    .returning();

  await db
    .insert(tokenBalancesTable)
    .values({ userId: saved.id })
    .onConflictDoNothing();

  return {
    id: saved.id,
    email: saved.email ?? null,
    firstName: saved.firstName ?? null,
    lastName: saved.lastName ?? null,
    profileImageUrl: saved.profileImageUrl ?? null,
    authProvider: saved.authProvider,
    isAdmin: saved.isAdmin ?? false,
    isPremium: saved.isPremium ?? false,
    emailVerified: saved.emailVerified ?? false,
  };
}
