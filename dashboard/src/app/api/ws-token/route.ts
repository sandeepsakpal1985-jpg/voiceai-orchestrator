import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createWsToken } from "@/lib/ws-auth";

/**
 * GET /api/ws-token
 *
 * Returns a short-lived JWT token for WebSocket authentication.
 * The client sends this token to the WS server as { type: "auth", token }.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await createWsToken(session.user.id);

    return NextResponse.json({
      token,
      expiresIn: "5m",
    });
  } catch (error) {
    console.error("GET /api/ws-token error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
