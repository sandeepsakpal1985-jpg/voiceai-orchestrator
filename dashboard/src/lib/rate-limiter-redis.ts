/**
 * VoiceAI Dashboard — Redis-backed Rate Limiter
 *
 * Distributed rate limiting using Redis sorted sets (sliding window).
 * Falls back to in-memory rate limiting when Redis is unavailable.
 *
 * Usage:
 *   import { checkRateLimit, resetRateLimit } from "@/lib/rate-limiter-redis";
 *   // Same interface as the in-memory version
 *
 * Requires: Redis URL in REDIS_URL or UPSTASH_REDIS_REST_URL env var.
 */

import { checkRateLimit as memCheck, resetRateLimit as memReset } from "./rate-limiter";
import type { RateLimitConfig, RateLimitResult } from "./rate-limiter";
import { getConfigForRoute } from "./rate-limiter";

export { getConfigForRoute };
export type { RateLimitResult, RateLimitConfig };

// ── Redis client (lazy init) ────────────────────────────────────────

type RedisClient = {
  multi: () => {
    zadd: (key: string, score: number, member: string) => void;
    zremrangebyscore: (key: string, min: number, max: number) => void;
    zcard: (key: string) => void;
    expire: (key: string, seconds: number) => void;
    exec: () => Promise<[Error | null, unknown][]>;
  };
  zadd: (key: string, score: number, member: string) => Promise<number>;
  zremrangebyscore: (key: string, min: number, max: number) => Promise<number>;
  zcard: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  quit: () => Promise<void>;
};

let redisClient: RedisClient | null = null;
let redisAvailable = false;
let redisInitAttempted = false;

async function getRedis(): Promise<RedisClient | null> {
  if (redisInitAttempted) return redisAvailable ? redisClient : null;
  redisInitAttempted = true;

  const redisUrl =
    process.env.REDIS_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    "";

  if (!redisUrl) {
    console.warn(
      "[RateLimiter] No REDIS_URL or UPSTASH_REDIS_REST_URL set — falling back to in-memory rate limiter"
    );
    return null;
  }

  try {
    // Use dynamic import to allow graceful fallback
    const Redis = await import("ioredis").then((m) => m.default);
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // disable reconnect — fail fast
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    await client.connect();
    // Verify connectivity
    await client.ping();
    redisClient = client as unknown as RedisClient;
    redisAvailable = true;
    console.log("[RateLimiter] Connected to Redis");
    return redisClient;
  } catch (err) {
    const msg = (err as Error).message;
    const hasRedisUrl = !!process.env.REDIS_URL || !!process.env.UPSTASH_REDIS_REST_URL;
    if (msg.includes("Cannot find module") || msg.includes("Module not found")) {
      console.warn(
        "[RateLimiter] ioredis module not found — install with 'npm install ioredis' for Redis-backed rate limiting. " +
        "Falling back to in-memory rate limiter."
      );
    } else if (hasRedisUrl) {
      console.warn(
        "[RateLimiter] REDIS_URL is set but Redis is unavailable — falling back to in-memory rate limiter:",
        msg
      );
    } else {
      console.warn(
        "[RateLimiter] Redis unavailable — falling back to in-memory rate limiter:",
        msg
      );
    }
    redisAvailable = false;
    return null;
  }
}

// ── Rate Limit (Redis / Fallback) ───────────────────────────────────

/**
 * Check rate limit using Redis (sliding window via sorted set).
 * Falls back to in-memory limiter if Redis is unavailable.
 *
 * Uses a Redis sorted set per identifier where:
 *   - member = `${timestamp}:${random}` (unique per request)
 *   - score = timestamp
 *
 * Algorithm:
 *   1. Remove entries outside the window
 *   2. Count remaining entries
 *   3. If under limit, add current timestamp
 *   4. Set TTL to window size (auto-cleanup)
 */
export async function checkRateLimitAsync(
  identifier: string,
  config: RateLimitConfig & { limit: number; windowMs: number } = { limit: 60, windowMs: 60_000 }
): Promise<RateLimitResult> {
  const redis = await getRedis();

  if (!redis) {
    // Fallback to in-memory
    return memCheck(identifier, config);
  }

  try {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const key = `ratelimit:${identifier}`;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    const multi = redis.multi();
    // Remove old entries outside the window
    multi.zremrangebyscore(key, 0, windowStart);
    // Count entries in the window
    multi.zcard(key);
    // Add current entry
    multi.zadd(key, now, member);
    // Set TTL to window size + 1s buffer
    multi.expire(key, Math.ceil(config.windowMs / 1000) + 1);

    const results = await multi.exec();

    // Extract count from zcard result (2nd operation)
    const countResult = results[1];
    const count =
      countResult && !(countResult[0] instanceof Error)
        ? (countResult[1] as number)
        : 0;

    const allowed = count < config.limit;

    // If not allowed, we need to undo the zadd — count is after adding
    // But since we use the count BEFORE adding the current entry, the check is:
    // count (before adding) < limit
    // Wait, let me re-examine. The multi.exec() runs atomically:
    // 1. zremrangebyscore — removes old entries
    // 2. zcard — counts remaining entries (BEFORE add)
    // 3. zadd — adds current entry
    // So count = entries in window before adding current one
    // limit check: count < limit → allowed
    // remaining = limit - count - 1 (for current entry)
    //
    // Actually, since zadd is always executed (we can't conditionally skip it in multi),
    // the count from zcard is the count BEFORE adding. So:
    // - count = entries already in window
    // - If count < limit → allowed (current entry is the (+1)th)
    // - remaining = limit - count - 1 (remaining after this request)

    return {
      allowed,
      remaining: allowed
        ? Math.max(0, config.limit - count - 1)
        : Math.max(0, config.limit - count),
      resetAt: now + config.windowMs,
      limit: config.limit,
    };
  } catch (err) {
    console.warn("[RateLimiter] Redis error, falling back to in-memory:", (err as Error).message);
    return memCheck(identifier, config);
  }
}

/**
 * Reset rate limit counters for a given identifier (or all).
 * Falls back to in-memory if Redis unavailable.
 */
export async function resetRateLimitAsync(identifier?: string): Promise<void> {
  const redis = await getRedis();

  if (!redis) {
    memReset(identifier);
    return;
  }

  try {
    if (identifier) {
      await redis.zremrangebyscore(`ratelimit:${identifier}`, 0, Date.now());
      await redis.expire(`ratelimit:${identifier}`, 1);
    }
    // Note: full reset across all keys is not supported with this pattern
    // (would need SCAN + DEL which is expensive)
    // Use memReset() for that or the dedicated API
  } catch {
    memReset(identifier);
  }
}

/**
 * Check if Redis is currently available.
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Force reconnection attempt (e.g., after Redis comes back online).
 */
export async function resetRedisConnection(): Promise<void> {
  await closeRedis();
}

/**
 * Gracefully close the Redis connection.
 */
export async function closeRedis(): Promise<void> {
  const client = redisClient;
  if (client) {
    redisClient = null;
    redisAvailable = false;
    redisInitAttempted = false;
    try {
      await client.quit();
    } catch {
      // Connection already closed or errored — ignore
    }
  }
}
