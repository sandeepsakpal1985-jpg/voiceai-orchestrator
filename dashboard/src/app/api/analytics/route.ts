import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days")) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalCalls, completedCalls, failedCalls, avgDuration, sentimentData, dailyData] =
      await Promise.all([
        prisma.callLog.count({
          where: { userId: session.user.id, createdAt: { gte: startDate } },
        }),
        prisma.callLog.count({
          where: {
            userId: session.user.id,
            status: "COMPLETED",
            createdAt: { gte: startDate },
          },
        }),
        prisma.callLog.count({
          where: {
            userId: session.user.id,
            status: "FAILED",
            createdAt: { gte: startDate },
          },
        }),
        prisma.callLog.aggregate({
          where: { userId: session.user.id, createdAt: { gte: startDate } },
          _avg: { duration: true },
        }),
        prisma.callLog.groupBy({
          by: ["sentiment"],
          where: {
            userId: session.user.id,
            sentiment: { not: null },
            createdAt: { gte: startDate },
          },
          _count: true,
        }),
        prisma.callLog.findMany({
          where: { userId: session.user.id, createdAt: { gte: startDate } },
          select: { createdAt: true, duration: true, status: true },
          orderBy: { createdAt: "asc" },
        }),
      ]);

    return NextResponse.json({
      totalCalls,
      completedCalls,
      failedCalls,
      avgDuration: avgDuration._avg.duration ?? 0,
      successRate: totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0,
      sentimentBreakdown: sentimentData,
      dailyTrend: dailyData,
      period: { days, startDate },
    });
  } catch (error) {
    console.error("GET /api/analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
