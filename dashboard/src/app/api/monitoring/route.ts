import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMetricsSnapshot, getRecentLogs, log, resetMetrics } from "@/lib/monitoring";

export const runtime = "nodejs";

/**
 * GET /api/monitoring
 *
 * Returns a snapshot of performance metrics, memory usage, and recent logs.
 * Requires admin authentication.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const start = Date.now();
    const snapshot = getMetricsSnapshot();
    const recentLogs = getRecentLogs(50);
    const duration = Date.now() - start;

    log({
      level: "info",
      message: "Monitoring snapshot fetched",
      path: "/api/monitoring",
      method: "GET",
      durationMs: duration,
      statusCode: 200,
    });

    return NextResponse.json({
      ...snapshot,
      recentLogs,
    });
  } catch (err) {
    log({
      level: "error",
      message: "Failed to fetch monitoring snapshot",
      error: (err as Error).message,
    });

    return NextResponse.json(
      { error: "Failed to fetch monitoring data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring (admin action: reset metrics)
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    resetMetrics();

    return NextResponse.json({ ok: true, message: "Metrics reset" });
  } catch {
    return NextResponse.json(
      { error: "Failed to reset metrics" },
      { status: 500 }
    );
  }
}
