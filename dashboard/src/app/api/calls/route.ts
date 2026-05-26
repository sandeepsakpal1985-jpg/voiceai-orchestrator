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
    const status = searchParams.get("status");
    const campaignId = searchParams.get("campaignId");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const offset = Number(searchParams.get("offset")) || 0;

    const where: Record<string, unknown> = { userId: session.user.id };
    if (status) where.status = status;
    if (campaignId) where.campaignId = campaignId;

    const [calls, total] = await Promise.all([
      prisma.callLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { campaign: { select: { name: true } } },
      }),
      prisma.callLog.count({ where }),
    ]);

    return NextResponse.json({ calls, total, limit, offset });
  } catch (error) {
    console.error("GET /api/calls error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calls" },
      { status: 500 }
    );
  }
}
