import type { Request, Response, NextFunction } from "express";
import { redisIncr, redisExpire } from "./redis.js";

interface RateLimitOptions {
  windowSecs: number;
  max: number;
  keyPrefix?: string;
  message?: string;
}

function getIdentifier(req: Request): string {
  const userId = req.isAuthenticated?.() ? (req.user as { id: string }).id : null;
  if (userId) return `u:${userId}`;
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";
  return `ip:${ip}`;
}

export function redisRateLimit(opts: RateLimitOptions) {
  const { windowSecs, max, keyPrefix = "rl", message = "Too many requests, please slow down." } = opts;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = getIdentifier(req);
    const endpoint = req.path.replace(/\/[0-9a-f-]{8,}/gi, "/:id");
    const key = `${keyPrefix}:${endpoint}:${id}`;

    const count = await redisIncr(key);

    if (count === null) {
      next();
      return;
    }

    if (count === 1) {
      await redisExpire(key, windowSecs);
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));

    if (count > max) {
      res.setHeader("Retry-After", windowSecs);
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
