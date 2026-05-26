/**
 * VoiceAI Dashboard — Client-Side Event Tracking
 *
 * Lightweight analytics utility for tracking user interactions
 * across dashboard pages. Uses beacon API for reliable delivery
 * and falls back to fetch if unavailable.
 */

export interface TrackingEvent {
  type: "page_view" | "interaction";
  page: string;
  action: string;
  label?: string;
  value?: string | number;
  timestamp: number;
}

const TRACKING_ENDPOINT = "/api/tracking";
const eventQueue: TrackingEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isTrackingEnabled = true;

/**
 * Enable or disable tracking (e.g., for tests or privacy).
 */
export function setTrackingEnabled(enabled: boolean): void {
  isTrackingEnabled = enabled;
}

/**
 * Track a page view event.
 */
export function trackPageView(page: string, label?: string): void {
  if (!isTrackingEnabled) return;
  enqueue({
    type: "page_view",
    page,
    action: "view",
    label,
    value: undefined,
    timestamp: Date.now(),
  });
}

/**
 * Track a user interaction event.
 */
export function trackInteraction(
  page: string,
  action: string,
  label?: string,
  value?: string | number
): void {
  if (!isTrackingEnabled) return;
  enqueue({
    type: "interaction",
    page,
    action,
    label,
    value,
    timestamp: Date.now(),
  });
}

/**
 * Enqueue an event and schedule a flush.
 */
function enqueue(event: TrackingEvent): void {
  eventQueue.push(event);

  // Flush immediately for page views, debounce interactions
  if (event.type === "page_view") {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, 2000);
  }
}

/**
 * Send queued events to the tracking endpoint.
 * Uses sendBeacon for reliable delivery during page unload.
 */
function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const batch = eventQueue.splice(0, eventQueue.length);
  if (batch.length === 0) return;

  const payload = JSON.stringify({ events: batch });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(TRACKING_ENDPOINT, payload);
    } else {
      fetch(TRACKING_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Silently fail — tracking should never break the UI
      });
    }
  } catch {
    // Silently fail
  }
}

/**
 * Flush and create a cleanup effect (call in useEffect return).
 */
export function useTrackingCleanup(): () => void {
  return () => {
    flush();
  };
}
