import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pipelines = await prisma.pipeline.findMany({
      where: { userId: session.user.id },
      include: {
        stages: { orderBy: { order: "asc" } },
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ pipelines });
  } catch (error) {
    console.error("GET /api/crm/pipelines error:", error);
    return NextResponse.json({ error: "Failed to fetch pipelines" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const pipeline = await prisma.pipeline.create({
      data: {
        userId: session.user.id,
        name: body.name,
        description: body.description,
        isDefault: body.isDefault ?? false,
        stages: {
          create: body.stages?.map((s: any, i: number) => ({
            name: s.name,
            order: i,
            color: s.color ?? "#6366f1",
            winProbability: s.winProbability ?? 50,
          })) ?? [
            { name: "New Lead", order: 0, color: "#6366f1", winProbability: 10 },
            { name: "Contacted", order: 1, color: "#f59e0b", winProbability: 25 },
            { name: "Qualified", order: 2, color: "#10b981", winProbability: 50 },
            { name: "Negotiating", order: 3, color: "#3b82f6", winProbability: 75 },
            { name: "Closed Won", order: 4, color: "#059669", winProbability: 100 },
          ],
        },
      },
      include: { stages: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ pipeline }, { status: 201 });
  } catch (error) {
    console.error("POST /api/crm/pipelines error:", error);
    return NextResponse.json({ error: "Failed to create pipeline" }, { status: 500 });
  }
}
