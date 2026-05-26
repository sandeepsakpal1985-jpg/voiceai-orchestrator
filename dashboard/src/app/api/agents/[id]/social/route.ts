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

    const socialAccounts = await prisma.agentSocialAccount.findMany({
      where: { agentId: id, agent: { userId: session.user.id } },
    });

    return NextResponse.json({ socialAccounts });
  } catch (error) {
    console.error("GET /api/agents/[id]/social error:", error);
    return NextResponse.json({ error: "Failed to fetch social accounts" }, { status: 500 });
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

    const agent = await prisma.agent.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const socialAccount = await prisma.agentSocialAccount.create({
      data: {
        agentId: id,
        platform: body.platform,
        accountId: body.accountId,
        accountName: body.accountName,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        webhookUrl: body.webhookUrl,
        autoReply: body.autoReply ?? false,
        enabled: body.enabled ?? true,
      },
    });

    // Also mark agent as social-connected
    await prisma.agent.update({
      where: { id },
      data: { socialConnected: true },
    });

    return NextResponse.json({ socialAccount }, { status: 201 });
  } catch (error) {
    console.error("POST /api/agents/[id]/social error:", error);
    return NextResponse.json({ error: "Failed to connect social account" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }

    await prisma.agentSocialAccount.deleteMany({
      where: { id: accountId, agentId: id, agent: { userId: session.user.id } },
    });

    // Check if any social accounts remain
    const remaining = await prisma.agentSocialAccount.count({
      where: { agentId: id },
    });
    if (remaining === 0) {
      await prisma.agent.update({
        where: { id },
        data: { socialConnected: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/agents/[id]/social error:", error);
    return NextResponse.json({ error: "Failed to remove social account" }, { status: 500 });
  }
}
