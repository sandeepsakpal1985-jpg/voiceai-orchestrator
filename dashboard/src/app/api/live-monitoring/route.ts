import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getLiveMonitoringData,
  formatDuration,
  calcAvgWaitSeconds,
} from "@/lib/queries";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await getLiveMonitoringData(session.user.id);

    // Calculate queue stats
    const queueCount = raw.queuedOrRinging.length;

    // Average wait from recent completed
    const avgWaitSeconds = calcAvgWaitSeconds(raw.recentCompleted);

    // Answer rate
    const answerRate =
      raw.todayTotal > 0
        ? Number(((raw.todayCompleted / raw.todayTotal) * 100).toFixed(1))
        : 0;

    // Map active calls to frontend format
    const mappedActiveCalls = raw.activeCalls.map((call) => ({
      id: call.id,
      contact: call.contactName ?? "Unknown Caller",
      phone: call.contactPhone ?? "",
      duration: formatDuration(call.duration),
      agent: "AI Agent",
      sentiment: (call.sentiment ?? "neutral").toLowerCase(),
      status: "active",
    }));

    return NextResponse.json({
      activeCalls: mappedActiveCalls,
      queueCount,
      avgWaitSeconds,
      activeAgentCount: raw.totalUsers,
      agentsOnCalls: raw.activeCalls.length,
      agentsAvailable: Math.max(0, raw.totalUsers - raw.activeCalls.length),
      todayTotal: raw.todayTotal,
      todayCompleted: raw.todayCompleted,
      answerRate,
    });
  } catch (error) {
    console.error("GET /api/live-monitoring error:", error);
    return NextResponse.json(
      { error: "Failed to fetch live monitoring data" },
      { status: 500 }
    );
  }
}
