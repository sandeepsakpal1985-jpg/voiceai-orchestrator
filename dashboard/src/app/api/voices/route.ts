import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const voiceSettings = await prisma.voiceSettings.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ voiceSettings });
  } catch (error) {
    console.error("GET /api/voices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch voice settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const voiceSettings = await prisma.voiceSettings.upsert({
      where: { userId: session.user.id },
      update: body,
      create: { userId: session.user.id, ...body },
    });

    return NextResponse.json({ voiceSettings });
  } catch (error) {
    console.error("PUT /api/voices error:", error);
    return NextResponse.json(
      { error: "Failed to update voice settings" },
      { status: 500 }
    );
  }
}
