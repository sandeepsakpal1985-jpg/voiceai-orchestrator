/**
 * Twilio Gather Webhook
 *
 * Handles speech gathered from the caller via Twilio's <Gather> verb.
 * Processes the speech through the AI agent and returns TwiML for the response.
 *
 * Twilio POSTs to this URL (configured in the main webhook's <Gather action="...">).
 */

import { getDefaultAgent } from "@/lib/ai/agent";
import { getConversationByCallSid } from "@/lib/ai/conversation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const speechResult = (formData.get("SpeechResult") as string) || "";
    const callerNumber = (formData.get("From") as string) || "";
    const callSid = (formData.get("CallSid") as string) || "";
    const confidence = (formData.get("Confidence") as string) || "";
    const digits = (formData.get("Digits") as string) || "";

    console.log(`🗣️ Gather speech from ${callerNumber}: "${speechResult}" (confidence: ${confidence})`);

    // Handle DTMF input (digits) as well
    const userInput = speechResult || digits || "";

    if (!userInput) {
      // No speech detected — prompt again
      return respondWithTwiML(
        "I'm sorry, I didn't catch that. Could you please repeat yourself?",
        false
      );
    }

    // Look up the active conversation by CallSid
    let conversation = getConversationByCallSid(callSid);

    // If no conversation found by callSid, try finding it by phone number
    if (!conversation) {
      console.warn(`No conversation found for CallSid: ${callSid}, checking active conversations`);
      const agent = getDefaultAgent();
      const activeConversations = agent.getActiveConversations();
      conversation = activeConversations.find(
        (c) => c.contactPhone === callerNumber
      );
    }

    if (!conversation) {
      // No existing conversation — start a new one
      const agent = getDefaultAgent();
      const result = await agent.handleIncomingCall({
        to: callerNumber,
        metadata: { callSid },
      });

      // Process the user input in the new conversation
      try {
        await agent.processUserInput(result.conversationId, userInput);
      } catch {
        // If processing fails, just respond with the greeting
      }

      return respondWithTwiML(
        `Thank you for calling. Let me transfer you to the right team. In the meantime, could you tell me more about what you're looking for?`,
        false
      );
    }

    const conversationId = conversation.id;
    const agent = getDefaultAgent();

    // Check for end-call phrases
    const lowerInput = userInput.toLowerCase().trim();
    const endCallPhrases = ["goodbye", "bye", "hang up", "end call", "that's all", "no thanks", "no thank you"];

    if (endCallPhrases.some((phrase) => lowerInput === phrase || lowerInput.startsWith(phrase))) {
      await agent.endConversation(conversationId);

      return respondWithTwiML(
        "Thank you for your time! It was great speaking with you. Have a wonderful day! Goodbye.",
        true
      );
    }

    // Process the user input through the AI agent
    let agentMessage: string;
    try {
      const response = await agent.processUserInput(conversationId, userInput);
      agentMessage = response.content;
    } catch (error) {
      console.error("AI agent processing error:", error);
      agentMessage =
        "I'm sorry, I'm having trouble processing that right now. Could you please try again?";
    }

    return respondWithTwiML(agentMessage, false);
  } catch (error) {
    console.error("Twilio gather webhook error:", error);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">I'm sorry, we're experiencing a technical issue. Please try your call again later. Goodbye.</Say>
  <Hangup />
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

/**
 * Build and return a TwiML response with the agent's message and a <Gather> to continue.
 */
function respondWithTwiML(
  message: string,
  endCall: boolean
): Response {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://your-domain.com";
  const escapedMessage = escapeXml(message);

  let twiml: string;

  if (endCall) {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">${escapedMessage}</Say>
  <Hangup />
</Response>`;
  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">${escapedMessage}</Say>
  <Gather
    input="speech dtmf"
    timeout="5"
    speechTimeout="auto"
    speechModel="phone_call"
    action="${baseUrl}/api/webhooks/twilio/gather"
    method="POST"
  >
    <Say voice="alice">Please go ahead.</Say>
  </Gather>
  <Redirect method="POST">${baseUrl}/api/webhooks/twilio/voice</Redirect>
</Response>`;
  }

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
