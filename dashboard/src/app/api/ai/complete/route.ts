import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { complete } from "@/lib/ai/llm";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messages, temperature, maxTokens } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    const response = await complete({
      messages,
      temperature,
      maxTokens,
    });

    return NextResponse.json({
      content: response.content,
      usage: response.usage,
    });
  } catch (error) {
    console.error("POST /api/ai/complete error:", error);
    return NextResponse.json(
      { error: "Failed to process completion request" },
      { status: 500 }
    );
  }
}
