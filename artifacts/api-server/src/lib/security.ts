import type { Request } from "express";
import { db, securityEventsTable } from "@workspace/db";

export async function logSecurityEvent(
  req: Request,
  type: string,
  severity: "low" | "medium" | "high" | "critical",
  userId?: string | null,
  description?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const ip =
      ((req.headers["x-forwarded-for"] as string) ?? "").split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const ua = ((req.headers["user-agent"] as string) ?? "").slice(0, 512);
    const email = (req.body as Record<string, unknown>)?.email as string | undefined;

    await db.insert(securityEventsTable).values({
      type,
      severity,
      userId: userId ?? undefined,
      ipAddress: ip,
      userAgent: ua,
      email: email?.slice(0, 255),
      description,
      metadata,
    });
  } catch {
    // Never crash the main request over a logging failure
  }
}
