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

    const [overall, byDay, recent] = await Promise.all([
      prisma.callLog.groupBy({
        by: ["sentiment"],
        where: {
          userId: session.user.id,
          sentiment: { not: null },
          createdAt: { gte: startDate },
        },
        _count: { id: true },
        _avg: { sentimentScore: true },
      }),
      prisma.callLog.findMany({
        where: {
          userId: session.user.id,
          sentiment: { not: null },
          createdAt: { gte: startDate },
        },
        select: { sentiment: true, sentimentScore: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.sentimentAnalytic.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({ overall, byDay, recent });
  } catch (error) {
    console.error("GET /api/sentiment error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sentiment data" },
      { status: 500 }
    );
  }
}
