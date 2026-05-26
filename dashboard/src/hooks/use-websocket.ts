"use client";

import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  /** WebSocket server URL. Defaults to ws://localhost:3001 */
  url?: string;
  /** Channels to subscribe to */
  channels?: string[];
  /** Auto-reconnect interval in ms. Default: 3000 */
  reconnectInterval?: number;
  /** User ID for auth — if provided, fetches a WS token from the API */
  userId?: string | null;
}

interface UseWebSocketReturn<T> {
  data: T | null;
  status: ConnectionStatus;
  lastUpdate: number | null;
}

/**
 * Hook for subscribing to the VoiceAI WebSocket server.
 * Automatically handles connection, JWT-based auth, reconnection, and channel subscription.
 */
export function useWebSocket<T = Record<string, unknown>>(
  options: UseWebSocketOptions = {}
): UseWebSocketReturn<T> {
  const {
    url = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001",
    channels = ["live-monitoring", "realtime-dashboard"],
    reconnectInterval = 3000,
    userId = null,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cache the WS token so we don't fetch on every reconnect
  const tokenRef = useRef<string | null>(null);

  const channelsKey = useMemo(() => channels.join(","), [channels]);

  /**
   * Fetch a fresh WebSocket JWT token from the server.
   * Called on initial connect and when the existing token fails auth.
   */
  const fetchToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/ws-token");
      if (!res.ok) return null;
      const data = await res.json();
      return data.token ?? null;
    } catch {
      return null;
    }
  }, []);

  // Store connect in a ref so timeout callbacks always call the latest version
  const connectRef = useRef<() => void>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatus("connected");

        // Fetch and send JWT token for auth
        if (!tokenRef.current) {
          tokenRef.current = await fetchToken();
        }
        if (tokenRef.current) {
          ws.send(JSON.stringify({ type: "auth", token: tokenRef.current }));
        } else if (userId) {
          // Fallback: direct userId (dev fallback)
          ws.send(JSON.stringify({ type: "auth", userId }));
        }

        // Subscribe to channels
        const channelList = channelsKey.split(",");
        for (const channel of channelList) {
          ws.send(JSON.stringify({ type: "subscribe", channel }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as T;

          // Handle auth errors — token may have expired
          if (typeof parsed === "object" && parsed !== null && "type" in parsed && parsed.type === "auth_error") {
            tokenRef.current = null; // Clear cached token
            // Re-fetch token and reconnect
            return;
          }

          setData(parsed);
          setLastUpdate(Date.now());
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        wsRef.current = null;

        // Auto-reconnect
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current?.();
        }, reconnectInterval);
      };

      ws.onerror = () => {
        setStatus("error");
        ws.close();
      };
    } catch {
      setStatus("error");
      // Try reconnecting
      reconnectTimerRef.current = setTimeout(() => {
        connectRef.current?.();
      }, reconnectInterval);
    }
  }, [url, userId, channelsKey, reconnectInterval, fetchToken]);

  // Sync the ref with the latest connect callback in an effect (not during render)
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    startTransition(() => {
      setStatus("connecting");
    });
    connectRef.current?.();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { data, status, lastUpdate };
}
