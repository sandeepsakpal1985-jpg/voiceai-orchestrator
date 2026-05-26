import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await prisma.multilingualConfig.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error("GET /api/multilingual error:", error);
    return NextResponse.json(
      { error: "Failed to fetch multilingual config" },
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
    const config = await prisma.multilingualConfig.upsert({
      where: { userId: session.user.id },
      update: {
        defaultLanguage: body.defaultLanguage,
        fallbackLanguage: body.fallbackLanguage,
        autoDetect: body.autoDetect,
        supportedLanguages: body.supportedLanguages ?? [],
        translationProvider: body.translationProvider,
      },
      create: {
        userId: session.user.id,
        defaultLanguage: body.defaultLanguage ?? "en-US",
        fallbackLanguage: body.fallbackLanguage ?? "en-US",
        autoDetect: body.autoDetect ?? true,
        supportedLanguages: body.supportedLanguages ?? [],
        translationProvider: body.translationProvider ?? "google",
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error("PUT /api/multilingual error:", error);
    return NextResponse.json(
      { error: "Failed to update multilingual config" },
      { status: 500 }
    );
  }
}
