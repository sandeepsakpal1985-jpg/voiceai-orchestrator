/**
 * Twilio Voice Webhook
 *
 * Handles incoming phone calls from Twilio.
 * Twilio POSTs to this URL when an incoming call is received.
 * Returns TwiML instructions that greet the caller and gather speech input.
 *
 * Environment variables needed:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_PHONE_NUMBER
 * - NEXT_PUBLIC_BASE_URL (your public-facing URL)
 */

import { getDefaultAgent } from "@/lib/ai/agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callerNumber = (formData.get("From") as string) || "";
    const calledNumber = (formData.get("To") as string) || "";
    const callSid = (formData.get("CallSid") as string) || "";
    const callStatus = (formData.get("CallStatus") as string) || "";

    console.log(`📞 Incoming call from ${callerNumber} to ${calledNumber} (SID: ${callSid}, status: ${callStatus})`);

    // Initiate the AI agent conversation with callSid mapping
    const agent = getDefaultAgent();
    const result = await agent.handleIncomingCall({
      to: callerNumber,
      from: calledNumber,
      metadata: { callSid, twilioCallStatus: callStatus },
    });

    console.log(`🤖 Agent started conversation: ${result.conversationId} for CallSid: ${callSid}`);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://your-domain.com";
    const escapedMessage = escapeXml(result.message);

    // Generate TwiML: greet the caller, then gather speech input
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">
    ${escapedMessage}
  </Say>
  <Gather
    input="speech dtmf"
    timeout="5"
    speechTimeout="auto"
    speechModel="phone_call"
    action="${baseUrl}/api/webhooks/twilio/gather"
    method="POST"
  >
    <Say voice="alice">Please go ahead and speak after the beep.</Say>
  </Gather>
  <Redirect method="POST">${baseUrl}/api/webhooks/twilio/voice</Redirect>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Twilio webhook error:", error);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">I'm sorry, we're experiencing technical difficulties. Please try your call again later. Goodbye.</Say>
  <Hangup />
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
