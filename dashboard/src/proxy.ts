/**
 * VoiceAI Dashboard — Next.js Proxy (formerly Middleware)
 *
 * Applies:
 *   — Rate limiting to all /api/* routes using IP-based tracking
 *   — CSRF protection headers for state-changing requests
 *
 * Rate limit defaults:
 *   - /api/auth/*          — 10 req/min
 *   - /api/ws-token        — 10 req/min
 *   - /api/webhooks/*      — 200 req/min
 *   - /api/monitoring      — 30 req/min
 *   - /api/* (default)     — 60 req/min
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getConfigForRoute } from "@/lib/rate-limiter";

export const config = {
  matcher: [
    // Apply proxy to all API routes
    "/api/:path*",
  ],
};

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  // Only process API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // CSRF protection: require X-Requested-With header on state-changing requests
  // Skip for:
  //   - /api/webhooks/* — called by external services (Twilio)
  //   - /api/auth/*    — NextAuth handles CSRF internally
  //   - /api/tracking  — called via sendBeacon which can't set custom headers
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isWebhook = pathname.startsWith("/api/webhooks/");
  const isAuthRoute = pathname.startsWith("/api/auth/");
  const isTracking = pathname.startsWith("/api/tracking");
  if (isStateChanging && !isWebhook && !isAuthRoute && !isTracking) {
    const csrfHeader = request.headers.get("x-requested-with");
    if (!csrfHeader || csrfHeader !== "XMLHttpRequest") {
      return new NextResponse(
        JSON.stringify({
          error: "CSRF validation failed",
          message: "State-changing requests must include X-Requested-With header",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // Determine client IP (Vercel header, standard forward, or fallback)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "127.0.0.1";

  const config = getConfigForRoute(pathname, method);
  const result = checkRateLimit(ip, config);

  // Set rate limit headers
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(result.resetAt));

  // If rate limited, return 429
  if (!result.allowed) {
    return new NextResponse(
      JSON.stringify({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetAt - Date.now()) / 1000)} seconds.`,
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.resetAt),
        },
      }
    );
  }

  return response;
}
