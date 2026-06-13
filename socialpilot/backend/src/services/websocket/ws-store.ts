/**
 * MetaPilot AI — WebSocket Client Store
 *
 * Pure client manager with no Fastify dependency. Holds the Set of
 * connected clients and provides broadcast/registration utilities.
 * Both ws-notify.ts (Fastify WS route) and event-bus.ts (Redis pub/sub)
 * import from this module.
 */

import type { WebSocket } from 'ws';

// ── Event Types ──

export type WsEventType =
  | 'inbox:new'
  | 'inbox:status_change'
  | 'inbox:escalated'
  | 'approval:new'
  | 'approval:status_change'
  | 'escalation:new'
  | 'escalation:status_change'
  | 'system:notification'
  | 'system:alert';

export interface WsEventPayload {
  inbox?: {
    id: string;
    customerHandle: string;
    customerName?: string;
    content: string;
    platform: string;
    priority: string;
    status: string;
  };
  approval?: {
    id: string;
    customerName?: string;
    platform: string;
    status: string;
    confidenceScore?: number;
    draftContent?: string;
    originalMessage?: string;
  };
  escalation?: {
    id: string;
    title?: string;
    severity: string;
    status: string;
    reason?: string;
  };
  system?: {
    title: string;
    message: string;
    severity?: 'info' | 'warning' | 'error';
    link?: string;
    linkLabel?: string;
  };
}

export interface WsEvent {
  type: WsEventType;
  payload: WsEventPayload;
  timestamp: string;
}

// ── Connection Manager ──

const clients = new Set<WebSocket>();

/**
 * Get the current number of connected clients.
 */
export function getConnectedCount(): number {
  return clients.size;
}

/**
 * Broadcast a typed event to all connected WebSocket clients.
 */
export function broadcast(type: WsEventType, payload: WsEventPayload): void {
  const event: WsEvent = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };

  const message = JSON.stringify(event);

  for (const client of clients) {
    try {
      if (client.readyState === 1) {
        // OPEN
        client.send(message);
      } else {
        clients.delete(client);
      }
    } catch {
      clients.delete(client);
    }
  }
}

/**
 * Register a WebSocket client and set up lifecycle handlers.
 */
export function registerClient(ws: WebSocket): void {
  clients.add(ws);

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
}

/**
 * Close all connections (call during graceful shutdown).
 */
export function closeAllConnections(): void {
  for (const client of clients) {
    try {
      client.close();
    } catch {
      // ignore close errors
    }
  }
  clients.clear();
}
