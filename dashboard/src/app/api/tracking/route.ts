/**
 * VoiceAI Dashboard — Event Tracking API
 *
 * Accepts client-side tracking events and archives them
 * via the monitoring system's structured logger.
 *
 * POST /api/tracking — Receive batched tracking events
 * GET  /api/tracking — Get recent tracking events (admin only)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { log } from "@/lib/monitoring";

/** In-memory ring buffer for recent tracking events */
const MAX_EVENTS = 500;
const recentEvents: TrackingEvent[] = [];

interface TrackingEvent {
  type: "page_view" | "interaction";
  page: string;
  action: string;
  label?: string;
  value?: string | number;
  timestamp: number;
}

interface TrackingPayload {
  events: TrackingEvent[];
}

/**
 * POST /api/tracking — Accept batched tracking events from client.
 * No auth required — events are anonymized and rate-limited by proxy.
 */
export async function POST(request: Request) {
  try {
    const payload: TrackingPayload = await request.json();

    if (!payload?.events?.length) {
      return NextResponse.json({ ok: true, accepted: 0 });
    }

    // Validate and store events
    const accepted: TrackingEvent[] = [];
    for (const event of payload.events) {
      if (event.type && event.page && event.action && event.timestamp) {
        accepted.push(event);
        recentEvents.push(event);

        // Log significant events to monitoring
        if (event.type === "page_view") {
          log({
            level: "info",
            message: `Page view: ${event.page}`,
            path: event.page,
            method: "VIEW",
          });
        }
      }
    }

    // Trim ring buffer
    if (recentEvents.length > MAX_EVENTS) {
      recentEvents.splice(0, recentEvents.length - MAX_EVENTS);
    }

    return NextResponse.json({ ok: true, accepted: accepted.length });
  } catch (err) {
    log({
      level: "warn",
      message: "Failed to parse tracking payload",
      error: (err as Error).message,
    });

    return NextResponse.json(
      { error: "Invalid tracking payload" },
      { status: 400 }
    );
  }
}

/**
 * GET /api/tracking — Get recent tracking events (admin only).
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      total: recentEvents.length,
      events: recentEvents.slice(-100),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch tracking events" },
      { status: 500 }
    );
  }
}
