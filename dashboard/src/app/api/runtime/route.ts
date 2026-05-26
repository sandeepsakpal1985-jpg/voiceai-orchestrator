/**
 * Runtime Status Proxy — Fetches live runtime data from the FastAPI backend.
 *
 * This bridges the dashboard to the actual running system:
 *   - LiveKit room status (active WebRTC rooms, participants)
 *   - Active SIP/PSTN calls (via LiveKit SIP)
 *   - Provider health (which STT/LLM/TTS providers are registered and active)
 *
 * The FastAPI backend exposes these at /runtime/* endpoints.
 * The Next.js dashboard proxies them here to avoid CORS issues
 * and to add authentication.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RuntimeData {
  status?: string;
  timestamp?: number;
  errors?: Array<{ source: string; error: string }> | null;
  livekit?: {
    enabled: boolean;
    url: string;
    connected: boolean;
    active_rooms: number;
    rooms: Array<{
      name: string;
      participants: number;
      created_at?: string;
    }>;
  };
  sip?: {
    enabled: boolean;
    server_address?: string;
    sip_port?: number;
    trunk_host?: string;
    active_calls: number;
    calls: Array<{
      call_id: string;
      from_number: string;
      to_number: string;
      room_name: string;
      status: string;
      duration_seconds?: number;
    }>;
  };
  providers?: {
    active: { stt: string; llm: string; tts: string };
    registered: {
      stt: Array<{ name: string; is_active: boolean }>;
      llm: Array<{ name: string; is_active: boolean }>;
      tts: Array<{ name: string; is_active: boolean }>;
    };
  };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the aggregated runtime status from the FastAPI backend
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_BASE_URL}/runtime/status`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // Backend is not reachable — return degraded status
      return NextResponse.json({
        status: "degraded",
        timestamp: Date.now() / 1000,
        errors: [{ source: "backend", error: `HTTP ${res.status}` }],
        livekit: { enabled: false, url: "", connected: false, active_rooms: 0, rooms: [] },
        sip: { enabled: false, active_calls: 0, calls: [] },
        providers: { active: { stt: "unknown", llm: "unknown", tts: "unknown" }, registered: { stt: [], llm: [], tts: [] } },
      });
    }

    const data: RuntimeData = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    // Backend unreachable — return degraded but functional
    return NextResponse.json({
      status: "offline",
      timestamp: Date.now() / 1000,
      errors: [{ source: "backend", error: (error as Error).message || "Connection failed" }],
      livekit: { enabled: false, url: "", connected: false, active_rooms: 0, rooms: [] },
      sip: { enabled: false, active_calls: 0, calls: [] },
      providers: { active: { stt: "unknown", llm: "unknown", tts: "unknown" }, registered: { stt: [], llm: [], tts: [] } },
    });
  }
}
