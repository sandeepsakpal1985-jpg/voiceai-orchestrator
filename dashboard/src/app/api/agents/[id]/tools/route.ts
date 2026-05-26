import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tools = await prisma.agentTool.findMany({
      where: { agentId: id, agent: { userId: session.user.id } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tools });
  } catch (error) {
    console.error("GET /api/agents/[id]/tools error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const tool = await prisma.agentTool.create({
      data: {
        agentId: id,
        name: body.name,
        type: body.type,
        config: body.config ?? {},
        enabled: body.enabled ?? true,
      },
    });

    return NextResponse.json({ tool }, { status: 201 });
  } catch (error) {
    console.error("POST /api/agents/[id]/tools error:", error);
    return NextResponse.json(
      { error: "Failed to create tool" },
      { status: 500 }
    );
  }
}
