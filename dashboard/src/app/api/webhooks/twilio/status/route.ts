/**
 * Twilio Status Callback Webhook
 *
 * Receives status updates for calls (queued, ringing, in-progress, completed, etc.)
 * Persists call data to the database via Prisma.
 *
 * Configure this URL in your Twilio phone number's "Status Callback URL" setting.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getConversationByCallSid, updateConversationStatus } from "@/lib/ai/conversation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callSid = (formData.get("CallSid") as string) || "";
    const callStatus = (formData.get("CallStatus") as string) || "";
    const callerNumber = (formData.get("From") as string) || "";
    const calledNumber = (formData.get("To") as string) || "";
    const duration = (formData.get("CallDuration") as string) || null;
    const direction = (formData.get("Direction") as string) || "";
    const recordingUrl = (formData.get("RecordingUrl") as string) || null;
    const durationSeconds = (formData.get("Duration") as string) || null;
    const callDuration = duration || durationSeconds;

    console.log(`📊 Call status update:`, {
      callSid,
      status: callStatus,
      from: callerNumber,
      to: calledNumber,
      direction,
      duration: callDuration,
      recordingUrl,
    });

    // Update in-memory conversation status
    if (callStatus === "completed" || callStatus === "failed" || callStatus === "busy" || callStatus === "no-answer" || callStatus === "canceled") {
      const conversation = getConversationByCallSid(callSid);
      if (conversation) {
        const mappedStatus =
          callStatus === "completed" ? "completed" :
          callStatus === "failed" ? "failed" :
          callStatus === "busy" || callStatus === "no-answer" ? "failed" : "completed";
        updateConversationStatus(conversation.id, mappedStatus);
      }
    }

    // Persist to database for completed/failed calls
    if (callStatus === "completed" || callStatus === "failed" || callStatus === "busy" || callStatus === "no-answer") {
      try {
        const dbStatus =
          callStatus === "completed" ? "COMPLETED" :
          callStatus === "failed" ? "FAILED" :
          callStatus === "busy" ? "BUSY" : "NO_ANSWER";

        const durationNum = callDuration ? parseInt(callDuration, 10) : null;

        // Look up a user to associate this call with.
        // In production, match the called number to a user's Twilio config.
        const targetUser = await prisma.user.findFirst({
          where: { role: "ADMIN" },
          select: { id: true },
        });

        if (!targetUser) {
          console.warn(`No admin user found — skipping DB write for call ${callSid}`);
        } else {
          await prisma.callLog.create({
            data: {
              userId: targetUser.id,
              contactName: callerNumber,
              contactPhone: callerNumber,
              duration: durationNum,
              status: dbStatus as "COMPLETED" | "FAILED" | "BUSY" | "NO_ANSWER",
              direction: direction === "inbound" ? "inbound" : "outbound",
              recordingUrl: recordingUrl,
              recordingDuration: durationNum,
              notes: `Twilio call ${callSid} ended with status: ${callStatus}`,
              tags: ["twilio", callStatus],
              startedAt: new Date(Date.now() - (durationNum ?? 0) * 1000),
              endedAt: new Date(),
            },
          });
        }

        console.log(`✅ Saved call ${callSid} to database`);
      } catch (dbError) {
        // Don't fail the webhook response if DB write fails
        console.error(`Failed to save call ${callSid} to database:`, dbError);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Twilio status callback error:", error);
    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
