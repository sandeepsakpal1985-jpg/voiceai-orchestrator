import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDefaultAgent } from "@/lib/ai/agent";
import {
  getConversation,
  updateConversationStatus,
  getAllActiveConversations,
} from "@/lib/ai/conversation";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      to,
      contactName,
      campaignId,
      prompt,
      voiceId,
      language,
    } = body;

    if (!to) {
      return NextResponse.json(
        { error: "Phone number (to) is required" },
        { status: 400 }
      );
    }

    const agent = getDefaultAgent();

    if (prompt) {
      agent.updateConfig({
        systemPrompt: prompt,
        voiceId: voiceId ?? agent.getConfig().voiceId,
        language: language ?? agent.getConfig().language,
      });
    }

    const result = await agent.handleIncomingCall({
      to,
      contactName,
      campaignId,
      metadata: { initiatedBy: session.user.id },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/agent/call error:", error);
    return NextResponse.json(
      { error: "Failed to initiate call" },
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
    const {
      conversationId,
      action,
      userInput,
    } = body;

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const conversation = getConversation(conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const agent = getDefaultAgent();

    switch (action) {
      case "process_input": {
        if (!userInput) {
          return NextResponse.json(
            { error: "userInput is required for process_input action" },
            { status: 400 }
          );
        }
        const agentMessage = await agent.processUserInput(conversationId, userInput);
        return NextResponse.json({
          conversationId,
          agentResponse: agentMessage.content,
          sentiment: conversation.sentiment,
        });
      }

      case "end": {
        const summary = await agent.endConversation(conversationId);
        return NextResponse.json({
          conversationId,
          status: "completed",
          summary,
        });
      }

      case "pause": {
        updateConversationStatus(conversationId, "paused");
        return NextResponse.json({
          conversationId,
          status: "paused",
        });
      }

      case "resume": {
        updateConversationStatus(conversationId, "in_progress");
        return NextResponse.json({
          conversationId,
          status: "in_progress",
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("PUT /api/agent/call error:", error);
    return NextResponse.json(
      { error: "Failed to process call action" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    if (conversationId) {
      const conversation = getConversation(conversationId);
      if (!conversation) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ conversation });
    }

    const activeConversations = getAllActiveConversations();
    return NextResponse.json({
      conversations: activeConversations,
      total: activeConversations.length,
    });
  } catch (error) {
    console.error("GET /api/agent/call error:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}
