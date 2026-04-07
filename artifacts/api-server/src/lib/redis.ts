import Redis from "ioredis";
import { logger } from "./logger.js";

let _redis: Redis | null = null;
let _connecting = false;

const REDIS_URL = process.env["REDIS_URL"];

if (REDIS_URL) {
  _connecting = true;
  _redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 5000,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 500, 2000);
    },
  });

  _redis.on("connect", () => {
    logger.info("Redis connected");
    _connecting = false;
  });

  _redis.on("error", (err: Error) => {
    logger.warn({ err: err.message }, "Redis error");
  });

  _redis.on("close", () => {
    logger.info("Redis connection closed");
  });

  _redis.connect().catch((err: Error) => {
    logger.warn({ err: err.message }, "Redis initial connect failed — running without cache");
    _redis = null;
    _connecting = false;
  });
} else {
  logger.info("REDIS_URL not set — AI caching, queues, and Redis rate limiting disabled");
}

export function getRedis(): Redis | null {
  return _redis;
}

export function isRedisAvailable(): boolean {
  return _redis !== null && _redis.status === "ready";
}

export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

export async function redisSetex(key: string, ttl: number, value: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.setex(key, ttl, value);
  } catch {
    // non-fatal
  }
}

export async function redisIncr(key: string): Promise<number | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return await r.incr(key);
  } catch {
    return null;
  }
}

export async function redisExpire(key: string, ttl: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.expire(key, ttl);
  } catch {
    // non-fatal
  }
}
