import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agents = await prisma.agent.findMany({
      where: { userId: session.user.id },
      include: { tools: true, socialAccounts: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("GET /api/agents error:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const agent = await prisma.agent.create({
      data: {
        userId: session.user.id,
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        personality: body.personality ?? {},
        voiceId: body.voiceId,
        language: body.language ?? "en-US",
        speakingRate: body.speakingRate ?? 1.0,
        pitch: body.pitch ?? 0.0,
        temperature: body.temperature ?? 0.7,
        maxTokens: body.maxTokens ?? 1024,
        sttProvider: body.sttProvider ?? "whisper",
        llmProvider: body.llmProvider ?? "ollama",
        ttsProvider: body.ttsProvider ?? "kokoro",
        memoryEnabled: body.memoryEnabled ?? true,
        memoryType: body.memoryType ?? "conversation",
        toolsEnabled: body.toolsEnabled ?? true,
      },
      include: { tools: true, socialAccounts: true },
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("POST /api/agents error:", error);
    return NextResponse.json(
      { error: "Failed to create agent" },
      { status: 500 }
    );
  }
}
