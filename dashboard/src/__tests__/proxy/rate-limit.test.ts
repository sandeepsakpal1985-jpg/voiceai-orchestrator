/**
 * VoiceAI Dashboard — Rate Limit Proxy Tests
 *
 * Tests the proxy's rate limiting behavior by calling the exported
 * proxy function with mocked NextRequest objects.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimit } from "@/lib/rate-limiter";

// Import the proxy function and config
import { proxy, config } from "@/proxy";

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockRequest(
  path: string,
  options: { method?: string; ip?: string } = {}
): NextRequest {
  const { method = "GET", ip = "127.0.0.1" } = options;
  const url = new URL(path, "http://localhost:3000");
  return new NextRequest(url, {
    method,
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

// ── Config ─────────────────────────────────────────────────────────────────

describe("proxy config", () => {
  it("targets all API routes", () => {
    expect(config.matcher).toContain("/api/:path*");
  });
});

// ── Basic Rate Limiting ────────────────────────────────────────────────────

describe("basic rate limiting", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("allows the first request through with correct headers", () => {
    const req = createMockRequest("/api/calls", { ip: "10.0.0.1" });
    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });

  it("returns 429 when rate limit is exceeded on auth route", () => {
    const ip = "429-auth-ip";
    const route = "/api/auth/login";

    // Send 10 requests to auth route (limit is 10)
    for (let i = 0; i < 10; i++) {
      const req = createMockRequest(route, { ip });
      const res = proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(9 - i));
    }

    // 11th request should be blocked with 429
    const blockedReq = createMockRequest(route, { ip });
    const blockedRes = proxy(blockedReq);

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(blockedRes.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(blockedRes.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns JSON error body on 429", () => {
    const ip = "429-json-body";
    const route = "/api/auth/login";

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      proxy(createMockRequest(route, { ip }));
    }

    // 11th request — blocked
    const blockedReq = createMockRequest(route, { ip });
    const blockedRes = proxy(blockedReq);

    expect(blockedRes.headers.get("Content-Type")).toContain("application/json");
  });
});

// ── IP Extraction ──────────────────────────────────────────────────────────

describe("IP extraction", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("uses x-forwarded-for header value as identifier", () => {
    const ip = "203.0.113.42";

    // First request
    const req1 = createMockRequest("/api/calls", { ip });
    const res1 = proxy(req1);
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

    // Second request from same IP — remaining should decrease
    const req2 = createMockRequest("/api/calls", { ip });
    const res2 = proxy(req2);
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("58");
  });

  it("tracks different IPs independently", () => {
    const reqA1 = createMockRequest("/api/calls", { ip: "10.0.0.1" });
    expect(proxy(reqA1).headers.get("X-RateLimit-Remaining")).toBe("59");

    const reqB1 = createMockRequest("/api/calls", { ip: "10.0.0.2" });
    expect(proxy(reqB1).headers.get("X-RateLimit-Remaining")).toBe("59");

    // First IP should have decremented
    const reqA2 = createMockRequest("/api/calls", { ip: "10.0.0.1" });
    expect(proxy(reqA2).headers.get("X-RateLimit-Remaining")).toBe("58");
  });

  it("takes first IP from multiple x-forwarded-for values", () => {
    const url = new URL("/api/calls", "http://localhost:3000");
    const req = new NextRequest(url, {
      headers: {
        "x-forwarded-for": "192.168.1.1, 10.0.0.1, 172.16.0.1",
      },
    });

    const res = proxy(req);
    expect(res.status).toBe(200);

    // Second request with same first IP should decrement remaining
    const req2 = proxy(req);
    expect(req2.headers.get("X-RateLimit-Remaining")).toBe("58");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const url = new URL("/api/calls", "http://localhost:3000");
    const req = new NextRequest(url, {
      headers: {
        "x-real-ip": "10.0.0.99",
      },
    });

    const res = proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");

    // Second request from same x-real-ip should decrement
    const req2 = proxy(req);
    expect(req2.headers.get("X-RateLimit-Remaining")).toBe("58");
  });

  it("uses fallback 127.0.0.1 when no IP headers are present", () => {
    const url = new URL("/api/calls", "http://localhost:3000");
    const req = new NextRequest(url);

    const res = proxy(req);
    expect(res.status).toBe(200);
  });
});

// ── Route-Specific Configs ─────────────────────────────────────────────────

describe("route-specific rate limits", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("applies auth config (10 req/min) to /api/auth/*", () => {
    const req = createMockRequest("/api/auth/login");
    const res = proxy(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
  });

  it("applies auth config (10 req/min) to /api/ws-token", () => {
    const req = createMockRequest("/api/ws-token");
    const res = proxy(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
  });

  it("applies webhook config (200 req/min) to /api/webhooks/*", () => {
    const req = createMockRequest("/api/webhooks/twilio");
    const res = proxy(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("200");
  });

  it("applies webhook config to nested webhook paths", () => {
    const req = createMockRequest("/api/webhooks/twilio/status/callback");
    const res = proxy(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("200");
  });

  it("applies monitoring config (30 req/min) to /api/monitoring", () => {
    const req = createMockRequest("/api/monitoring");
    const res = proxy(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
  });

  it("applies default config (60 req/min) to other API routes", () => {
    const req = createMockRequest("/api/calls");
    const res = proxy(req);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
  });
});

// ── Non-API Routes ─────────────────────────────────────────────────────────

describe("non-API routes", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("passes through without rate limit headers", () => {
    // Non-API routes won't reach proxy via the matcher,
    // but if called directly it should pass through
    const req = createMockRequest("/dashboard");
    const res = proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
  });
});

// ── Error Response Structure ───────────────────────────────────────────────

describe("429 error response", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("includes expected headers on 429", () => {
    const ip = "429-headers";
    const route = "/api/auth/login";

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      proxy(createMockRequest(route, { ip }));
    }

    const blockedRes = proxy(createMockRequest(route, { ip }));

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("Retry-After")).toBeTruthy();
    expect(blockedRes.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(blockedRes.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(blockedRes.headers.get("X-RateLimit-Reset")).toBeTruthy();
    expect(blockedRes.headers.get("Content-Type")).toContain("application/json");
  });

  it("includes error message in response body", async () => {
    const ip = "429-body";
    const route = "/api/auth/login";

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      proxy(createMockRequest(route, { ip }));
    }

    const blockedRes = proxy(createMockRequest(route, { ip }));
    const body = await blockedRes.json();

    expect(body).toHaveProperty("error", "Too Many Requests");
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("retryAfter");
    expect(typeof body.retryAfter).toBe("number");
    expect(body.retryAfter).toBeGreaterThan(0);
  });
});

// ── Rate Limit Header Consistency ──────────────────────────────────────────

describe("response header consistency", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("always includes X-RateLimit headers on allowed responses", () => {
    // Test across different route types
    const routes = [
      "/api/calls",
      "/api/auth/login",
      "/api/webhooks/twilio",
      "/api/monitoring",
      "/api/campaigns",
    ];

    for (const route of routes) {
      const req = createMockRequest(route);
      const res = proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
      expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
      expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
    }
  });

  it("decrements remaining count correctly per request", () => {
    const ip = "counting-ip";
    const route = "/api/calls";

    for (let i = 0; i < 5; i++) {
      const req = createMockRequest(route, { ip });
      const res = proxy(req);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(59 - i));
    }
  });
});

// ── Performance ────────────────────────────────────────────────────────────

describe("proxy performance", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("responds within 5ms for a normal request", () => {
    const req = createMockRequest("/api/calls");
    const start = performance.now();
    const res = proxy(req);
    const duration = performance.now() - start;

    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(5);
  });
});
