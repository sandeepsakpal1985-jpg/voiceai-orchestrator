"use client";

import { useState, useEffect, useRef } from "react";

interface LiveKitStatus {
  enabled: boolean;
  url: string;
  connected: boolean;
  active_rooms: number;
  rooms: Array<{
    name: string;
    participants: number;
    created_at?: string;
  }>;
}

interface SipStatus {
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
}

interface ProviderStatus {
  active: { stt: string; llm: string; tts: string };
  registered: {
    stt: Array<{ name: string; is_active: boolean }>;
    llm: Array<{ name: string; is_active: boolean }>;
    tts: Array<{ name: string; is_active: boolean }>;
  };
}

interface RuntimeStatus {
  status: string;
  timestamp: number;
  errors: Array<{ source: string; error: string }> | null;
  livekit: LiveKitStatus;
  sip: SipStatus;
  providers: ProviderStatus;
}

interface UseRuntimeStatusReturn {
  status: string;
  livekit: LiveKitStatus;
  sip: SipStatus;
  providers: ProviderStatus;
  errors: Array<{ source: string; error: string }> | null;
  loading: boolean;
}

const DEFAULT_STATUS: UseRuntimeStatusReturn = {
  status: "loading",
  livekit: { enabled: false, url: "", connected: false, active_rooms: 0, rooms: [] },
  sip: { enabled: false, active_calls: 0, calls: [] },
  providers: { active: { stt: "—", llm: "—", tts: "—" }, registered: { stt: [], llm: [], tts: [] } },
  errors: null,
  loading: true,
};

/**
 * Hook that polls the runtime status endpoint every 10 seconds.
 * Returns LiveKit, SIP, and provider health for dashboard display.
 */
export function useRuntimeStatus(pollIntervalMs = 10000): UseRuntimeStatusReturn {
  const [data, setData] = useState<UseRuntimeStatusReturn>(DEFAULT_STATUS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/runtime");
        if (!res.ok) {
          setData((prev) => ({
            ...prev,
            status: "offline",
            loading: false,
          }));
          return;
        }
        const json: RuntimeStatus = await res.json();
        setData({
          status: json.status ?? "unknown",
          livekit: json.livekit ?? DEFAULT_STATUS.livekit,
          sip: json.sip ?? DEFAULT_STATUS.sip,
          providers: json.providers ?? DEFAULT_STATUS.providers,
          errors: json.errors,
          loading: false,
        });
      } catch {
        setData((prev) => ({
          ...prev,
          status: "offline",
          loading: false,
        }));
      }
    }

    // Initial fetch
    fetchStatus();

    // Poll every N ms
    intervalRef.current = setInterval(fetchStatus, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pollIntervalMs]);

  return data;
}
