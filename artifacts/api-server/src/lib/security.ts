import fs from "fs";
import path from "path";
import type { Request } from "express";
import { db, securityEventsTable } from "@workspace/db";

const SECRET_KEYS = /password|token|secret|api[_-]?key|authorization|cookie/i;

function safe(value: unknown): string {
  if (value === undefined || value === null || value === "") return "none";
  const s = String(value).replace(/[\r\n]/g, " ").slice(0, 240);
  return /\s/.test(s) ? JSON.stringify(s) : s;
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata).filter(([k]) => !SECRET_KEYS.test(k)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 500) : v]));
}

export async function logSecurityEvent(
  req: Request,
  type: string,
  severity: "low" | "medium" | "high" | "critical",
  userId?: string | null,
  description?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const ip = ((req.headers["x-forwarded-for"] as string | undefined) ?? "").split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  const ua = ((req.headers["user-agent"] as string | undefined) ?? "").slice(0, 512);
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.slice(0, 255) : undefined;
  const requestId = (req as Request & { id?: string }).id ?? req.headers["x-request-id"] ?? "none";
  const cleanMetadata = sanitizeMetadata(metadata);

  const line = [
    "SECURITY_EVENT",
    `severity=${safe(severity)}`,
    `type=${safe(type)}`,
    `ip=${safe(ip)}`,
    `userId=${safe(userId ?? "none")}`,
    `email=${safe(email ?? "none")}`,
    `method=${safe(req.method)}`,
    `path=${safe(req.originalUrl?.split("?")[0] ?? req.path)}`,
    `reason=${safe(description ?? type)}`,
    `blocked=${safe(cleanMetadata?.blocked === true)}`,
    `requestId=${safe(requestId)}`,
  ].join(" ");

  try {
    const logPath = process.env.SECURITY_LOG_PATH ?? "/var/log/zimsolve/security.log";
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    try {
      fs.mkdirSync("logs", { recursive: true });
      fs.appendFileSync("logs/security.log", `${line}\n`, { encoding: "utf8", mode: 0o600 });
    } catch { /* ignore */ }
  }

  try {
    await db.insert(securityEventsTable).values({
      type,
      severity,
      userId: userId ?? undefined,
      ipAddress: ip,
      userAgent: ua,
      email,
      description,
      metadata: cleanMetadata,
      isBlocked: cleanMetadata?.blocked === true,
    });
  } catch {
    // Never crash the main request over a logging failure
  }
}
