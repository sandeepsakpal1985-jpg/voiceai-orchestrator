import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkRateLimitAsync,
  resetRateLimitAsync,
  isRedisAvailable,
  closeRedis,
} from "@/lib/rate-limiter-redis";
import { resetRateLimit } from "@/lib/rate-limiter";

// ── Helpers ────────────────────────────────────────────────────────────────

// ── Fallback Behavior (no Redis URL) ───────────────────────────────────────

describe("Redis rate limiter fallback", () => {
  beforeEach(() => {
    // Ensure no REDIS_URL or UPSTASH_REDIS_REST_URL is set
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    resetRateLimit();
  });

  afterEach(async () => {
    await closeRedis();
    resetRateLimit();
  });

  it("falls back to in-memory when no Redis URL is configured", async () => {
    const result = await checkRateLimitAsync("test-ip");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(60);
    expect(isRedisAvailable()).toBe(false);
  });

  it("in-memory fallback correctly enforces limits", async () => {
    const config = { limit: 5, windowMs: 60_000 };

    // Fire 5 requests — all allowed
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimitAsync("limited-ip", config);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }

    // 6th request — blocked
    const blocked = await checkRateLimitAsync("limited-ip", config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("fallback supports per-identifier isolation", async () => {
    const config = { limit: 2, windowMs: 60_000 };

    await checkRateLimitAsync("ip-a", config);
    await checkRateLimitAsync("ip-a", config);
    // ip-a should be blocked
    expect((await checkRateLimitAsync("ip-a", config)).allowed).toBe(false);

    // ip-b should still be allowed
    expect((await checkRateLimitAsync("ip-b", config)).allowed).toBe(true);
  });

  it("fallback supports sliding window via fake timers", async () => {
    vi.useFakeTimers();

    const config = { limit: 2, windowMs: 50_000 };

    // Exhaust limit
    await checkRateLimitAsync("slide-ip", config);
    await checkRateLimitAsync("slide-ip", config);
    expect((await checkRateLimitAsync("slide-ip", config)).allowed).toBe(false);

    // Advance time past window
    vi.advanceTimersByTime(51_000);

    // Should be allowed again
    expect((await checkRateLimitAsync("slide-ip", config)).allowed).toBe(true);

    vi.useRealTimers();
  });

  it("fallback reset works correctly", async () => {
    const config = { limit: 3, windowMs: 60_000 };

    await checkRateLimitAsync("reset-ip", config);
    await checkRateLimitAsync("reset-ip", config);
    await checkRateLimitAsync("reset-ip", config);
    expect((await checkRateLimitAsync("reset-ip", config)).allowed).toBe(false);

    // Reset the identifier
    await resetRateLimitAsync("reset-ip");
    expect((await checkRateLimitAsync("reset-ip", config)).allowed).toBe(true);
  });

  it("falls back to in-memory when Redis URL is set but connection fails", async () => {
    // Set an invalid Redis URL to trigger connection failure
    process.env.REDIS_URL = "redis://localhost:16379"; // unlikely to have Redis here

    const result = await checkRateLimitAsync("test-fallback");
    expect(result.allowed).toBe(true);
    // Should still work with in-memory fallback
    expect(result.limit).toBe(60);
  });
});

// ── No Redis (module not installed scenario) ───────────────────────────────

describe("Redis module not available", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    resetRateLimit();
  });

  afterEach(async () => {
    await closeRedis();
    resetRateLimit();
  });

  it("works without errors when env vars are missing", async () => {
    // Should not throw — just fall back gracefully
    await expect(
      checkRateLimitAsync("no-env")
    ).resolves.toHaveProperty("allowed", true);
  });

  it("bulk requests work through fallback", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        checkRateLimitAsync(`bulk-${i}`, { limit: 100, windowMs: 60_000 })
      )
    );

    expect(results).toHaveLength(10);
    for (const r of results) {
      expect(r.allowed).toBe(true);
    }
  });
});
