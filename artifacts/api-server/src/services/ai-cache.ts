import crypto from "crypto";
import { redisGet, redisSetex } from "../lib/redis.js";

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

function buildCacheKey(model: string, prompt: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${model}::${prompt}`)
    .digest("hex");
  return `ai:cache:${hash}`;
}

export async function getCachedAIResponse(model: string, prompt: string): Promise<string | null> {
  return redisGet(buildCacheKey(model, prompt));
}

export async function setCachedAIResponse(
  model: string,
  prompt: string,
  response: string,
): Promise<void> {
  if (response.length < 10) return;
  await redisSetex(buildCacheKey(model, prompt), CACHE_TTL_SECONDS, response);
}
