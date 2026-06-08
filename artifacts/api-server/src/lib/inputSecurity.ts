import type { Request, Response, NextFunction } from "express";
import { logSecurityEvent } from "./security";

const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\b(?:sudo|chmod|chown)\b/i,
  /\b(?:curl|wget)\b[^\n]{0,80}\|\s*(?:sh|bash)/i,
  /\b(?:bash|sh)\s+-c\b/i,
  /\b(?:nc|netcat)\b.*\b(?:-e|\/bin\/sh|\/bin\/bash)\b/i,
  /\b(?:python\s+-c|node\s+-e|powershell)\b/i,
  /\$\([^)]{1,200}\)|`[^`]{1,200}`/,
  /\/etc\/passwd|\.env\b|process\.env/i,
  /\b(?:api[_-]?key|secret|token|password)\b.{0,60}\b(?:dump|print|show|reveal|exfiltrate)\b/i,
  /\b(?:ignore|disregard)\b.{0,80}\b(?:system|developer|previous|prior)\b.{0,80}\b(?:prompt|instruction)s?\b/i,
  /\b(?:reveal|show|print|return)\b.{0,80}\b(?:system prompt|provider keys?|env(?:ironment)? vars?|secrets?)\b/i,
];

export function hasDangerousInput(value: unknown): boolean {
  if (typeof value === "string") return DANGEROUS_PATTERNS.some((p) => p.test(value));
  if (Array.isArray(value)) return value.some(hasDangerousInput);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasDangerousInput);
  return false;
}

export function validateUserText(req: Request, res: Response, next: NextFunction): void {
  if (["POST", "PUT", "PATCH"].includes(req.method) && hasDangerousInput(req.body)) {
    void logSecurityEvent(req, "dangerous_input_blocked", "high", req.user?.id, "Blocked dangerous user-submitted text", { path: req.path, blocked: true });
    res.status(403).json({ error: "Request contains unsupported unsafe content." });
    return;
  }
  if (hasDangerousInput(req.query)) {
    void logSecurityEvent(req, "dangerous_query_blocked", "high", req.user?.id, "Blocked dangerous query text", { path: req.path, blocked: true });
    res.status(400).json({ error: "Invalid query." });
    return;
  }
  next();
}
