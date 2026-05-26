/**
 * Twilio Voice Redirect Webhook
 *
 * Fallback endpoint for the <Redirect> verb in the TwiML response.
 * If the <Gather> timeout is reached without input, this endpoint
 * re-prompts the caller or ends the call gracefully.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callerNumber = (formData.get("From") as string) || "";
    const callSid = (formData.get("CallSid") as string) || "";
    const callStatus = (formData.get("CallStatus") as string) || "";

    console.log(`🔊 Voice redirect from ${callerNumber} (SID: ${callSid}, status: ${callStatus})`);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://your-domain.com";

    // Re-prompt the caller or end the call
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">
    I didn't hear anything. Please let me know if you're still there.
  </Say>
  <Gather
    input="speech dtmf"
    timeout="5"
    speechTimeout="auto"
    speechModel="phone_call"
    action="${baseUrl}/api/webhooks/twilio/gather"
    method="POST"
  >
    <Say voice="alice">Say something or press any key to continue.</Say>
  </Gather>
  <Say voice="alice">
    Since I didn't hear from you, I'll end this call now. Feel free to call back anytime. Goodbye.
  </Say>
  <Hangup />
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Twilio voice redirect error:", error);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">I'm sorry, we're experiencing technical difficulties. Please try again later. Goodbye.</Say>
  <Hangup />
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
