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
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const offset = Number(searchParams.get("offset")) || 0;

    const [recordings, total] = await Promise.all([
      prisma.callLog.findMany({
        where: {
          userId: session.user.id,
          recordingUrl: { not: null },
        },
        select: {
          id: true,
          contactName: true,
          contactPhone: true,
          duration: true,
          recordingUrl: true,
          recordingDuration: true,
          status: true,
          sentiment: true,
          createdAt: true,
          campaign: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.callLog.count({
        where: {
          userId: session.user.id,
          recordingUrl: { not: null },
        },
      }),
    ]);

    return NextResponse.json({ recordings, total, limit, offset });
  } catch (error) {
    console.error("GET /api/recordings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}
