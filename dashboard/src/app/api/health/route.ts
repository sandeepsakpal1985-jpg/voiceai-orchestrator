/**
 * VoiceAI Dashboard — Health Check Endpoint
 *
 * Aggregates the status of all system dependencies:
 *   - Database connectivity (Prisma)
 *   - WebSocket server reachability
 *   - Redis availability (via rate-limiter-redis)
 *   - Rate limiter health
 *
 * GET /api/health  → Full health report (200 if all healthy, 503 if critical failures)
 * GET /api/health?brief=true → Minimal status for load balancers
 */

import { NextResponse } from "next/server";

// ── Types ──────────────────────────────────────────────────────────

interface ComponentHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  error?: string;
}

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: number;
  components: {
    database: ComponentHealth;
    websocket: ComponentHealth;
    redis: ComponentHealth;
    rateLimiter: ComponentHealth;
  };
}

const startTime = Date.now();

// ── Helpers ────────────────────────────────────────────────────────

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

async function checkWebSocket(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const wsUrl = process.env.WS_URL || "http://localhost:3001";
    const res = await fetch(`${wsUrl}/ws-metrics`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      return { status: "healthy", latencyMs: Date.now() - start };
    }
    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const { isRedisAvailable } = await import("@/lib/rate-limiter-redis");
    const available = isRedisAvailable();
    if (available) {
      return { status: "healthy", latencyMs: Date.now() - start };
    }
    // Redis URL is set but unavailable → degraded
    if (process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL) {
      return {
        status: "degraded",
        latencyMs: Date.now() - start,
        error: "Redis URL configured but not connected (using in-memory fallback)",
      };
    }
    // No Redis configured — not critical
    return {
      status: "healthy",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

function checkRateLimiter(): ComponentHealth {
  return { status: "healthy", latencyMs: 0 };
}

// ── Route Handlers ─────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brief = searchParams.get("brief") === "true";

  // Run all checks in parallel
  const [database, websocket, redis, rateLimiter] = await Promise.all([
    checkDatabase(),
    checkWebSocket(),
    checkRedis(),
    checkRateLimiter(),
  ]);

  const components = { database, websocket, redis, rateLimiter };

  // Determine overall status
  const hasUnhealthy = Object.values(components).some(
    (c) => c.status === "unhealthy"
  );
  const hasDegraded = Object.values(components).some(
    (c) => c.status === "degraded"
  );
  const overallStatus: "healthy" | "degraded" | "unhealthy" = hasUnhealthy
    ? "unhealthy"
    : hasDegraded
      ? "degraded"
      : "healthy";

  // Brief mode: just status + uptime (for load balancers)
  if (brief) {
    return NextResponse.json(
      {
        status: overallStatus,
        uptime: Math.floor((Date.now() - startTime) / 1000),
      },
      {
        status: overallStatus === "healthy" ? 200 : 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const report: HealthReport = {
    status: overallStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: Date.now(),
    components,
  };

  return NextResponse.json(report, {
    status: overallStatus === "healthy" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
