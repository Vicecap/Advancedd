import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logSecurityEvent } from "./security";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT = [/^\/api\/billing\/webhook\/paypal$/, /^\/api\/billing\/dischub\/callback$/];

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE.has(req.method) || EXEMPT.some((rx) => rx.test(req.path))) return next();
  const cookie = req.cookies?.csrf_token as string | undefined;
  if (!cookie) {
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", token, { sameSite: "lax", secure: process.env.NODE_ENV === "production", httpOnly: false, path: "/" });
    if (!req.isAuthenticated?.()) return next();
  }
  if (!req.isAuthenticated?.()) return next();
  const header = req.headers["x-csrf-token"] as string | undefined;
  const a = Buffer.from(cookie ?? "");
  const b = Buffer.from(header ?? "");
  if (!cookie || !header || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    void logSecurityEvent(req, "csrf_rejected", "high", req.user?.id, "Missing or invalid CSRF token", { blocked: true });
    res.status(403).json({ error: "CSRF validation failed" });
    return;
  }
  next();
}
