import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await prisma.socialConnection.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("GET /api/social/connections error:", error);
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const connection = await prisma.socialConnection.create({
      data: {
        userId: session.user.id,
        platform: body.platform,
        accountId: body.accountId,
        accountName: body.accountName,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        webhookSecret: body.webhookSecret,
        autoReply: body.autoReply ?? false,
        welcomeMessage: body.welcomeMessage,
        status: "connected",
      },
    });

    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    console.error("POST /api/social/connections error:", error);
    return NextResponse.json({ error: "Failed to create connection" }, { status: 500 });
  }
}
