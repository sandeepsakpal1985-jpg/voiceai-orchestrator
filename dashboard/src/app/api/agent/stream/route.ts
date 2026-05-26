import { auth } from "@/lib/auth";
import { getDefaultAgent } from "@/lib/ai/agent";
import { getConversation } from "@/lib/ai/conversation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return new Response(
      JSON.stringify({ error: "conversationId query parameter is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const conversation = getConversation(conversationId);
  if (!conversation) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const agent = getDefaultAgent();

      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      const filterByConversation = (event: Record<string, unknown>) =>
        event.conversationId === conversationId ||
        !("conversationId" in event);

      const unsubMessageReceived = agent.on("message_received", (event) => {
        if (filterByConversation(event)) sendEvent("message_received", event);
      });

      const unsubAgentResponse = agent.on("agent_response", (event) => {
        if (filterByConversation(event)) sendEvent("agent_response", event);
      });

      const unsubSentiment = agent.on("sentiment_update", (event) => {
        if (filterByConversation(event)) sendEvent("sentiment_update", event);
      });

      const unsubConversationEnded = agent.on("conversation_ended", (event) => {
        if (filterByConversation(event)) {
          sendEvent("conversation_ended", event);
          sendEvent("done", { timestamp: Date.now() });
        }
      });

      const unsubError = agent.on("error", (event) => {
        sendEvent("error", event);
      });

      // Send initial conversation state
      sendEvent("connected", {
        conversationId,
        status: conversation.status,
        messages: conversation.messages,
        timestamp: Date.now(),
      });

      // Keep alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        sendEvent("ping", { timestamp: Date.now() });
      }, 30000);

      // Cleanup on connection close
      request.signal.addEventListener("abort", () => {
        unsubMessageReceived();
        unsubAgentResponse();
        unsubSentiment();
        unsubConversationEnded();
        unsubError();
        clearInterval(keepAlive);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
