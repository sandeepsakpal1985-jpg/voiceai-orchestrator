/**
 * MetaPilot AI — WebSocket Notification Hook
 *
 * Manages a persistent WebSocket connection to the backend notification
 * service. Automatically reconnects on disconnect and dispatches typed
 * events via a callback pattern.
 *
 * Usage:
 * ```tsx
 * const { connected, lastEvent } = useWebSocket({
 *   onEvent: (event) => {
 *     switch (event.type) {
 *       case 'inbox:new':
 *         toast(`New message from ${event.payload.inbox?.customerHandle}`);
 *         break;
 *     }
 *   },
 * });
 * ```
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from './api';

export interface WsEvent {
  type: string;
  payload: any;
  timestamp: string;
}

interface UseWebSocketOptions {
  /** Called for every incoming event */
  onEvent: (event: WsEvent) => void;
  /** Whether to enable the connection (default: true) */
  enabled?: boolean;
  /** Reconnect delay in ms (default: 5000) */
  reconnectDelay?: number;
}

interface UseWebSocketReturn {
  /** Whether the socket is currently connected */
  connected: boolean;
  /** Manually disconnect */
  disconnect: () => void;
  /** Manually reconnect */
  reconnect: () => void;
}

export function useWebSocket({
  onEvent,
  enabled = true,
  reconnectDelay = 5000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEventRef = useRef(onEvent);
  const [connected, setConnected] = useState(false);
  const mountedRef = useRef(true);
  const reconnectAttemptRef = useRef(0);

  // Keep the callback ref current without re-triggering the effect
  onEventRef.current = onEvent;

  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    mountedRef.current = false;
    clearPingInterval();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, [clearPingInterval]);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (!mountedRef.current) return;

    // Get auth token from localStorage
    let token: string | null = null;
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('token');
    }
    if (!token) return;

    // Build WS URL from the API base URL
    const baseUrl = API_BASE.replace(/^http/, 'ws');
    const url = `${baseUrl}/ws/notifications?token=${token}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        setConnected(true);
        reconnectAttemptRef.current = 0;

        // Send ping every 25s to keep the connection alive through proxies
        clearPingInterval();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          } else {
            clearPingInterval();
          }
        }, 25000);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const parsed: WsEvent = JSON.parse(event.data);
          onEventRef.current(parsed);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        clearPingInterval();

        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;

        // Auto-reconnect with exponential backoff
        reconnectAttemptRef.current += 1;
        const delay = Math.min(
          reconnectDelay * Math.pow(1.5, reconnectAttemptRef.current - 1),
          30000 // max 30s
        );
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror, so no need to handle here
      };
    } catch {
      // Connection failed, retry
      timerRef.current = setTimeout(connect, reconnectDelay);
    }
  }, [enabled, reconnectDelay]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const reconnect = useCallback(() => {
    disconnect();
    mountedRef.current = true;
    connect();
  }, [disconnect, connect]);

  return { connected, disconnect, reconnect };
}
