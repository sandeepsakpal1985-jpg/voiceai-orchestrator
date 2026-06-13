/**
 * MetaPilot AI — Redis Event Bus
 *
 * Bridges background workers (separate Node processes) to the WebSocket
 * notification system using Redis pub/sub. Workers publish events to a
 * Redis channel, and the backend subscribes and broadcasts to all
 * connected WebSocket clients.
 *
 * This avoids requiring workers to make HTTP calls to the backend.
 *
 * Usage:
 *   // In backend (app.ts startup):
 *   import { initEventBus } from './services/websocket/event-bus';
 *   initEventBus();
 *
 *   // In worker (after creating inbox item / approval request):
 *   import { publishWsEvent } from './services/websocket/event-bus';
 *   await publishWsEvent('inbox:new', { inbox: { ... } });
 */

import Redis from 'ioredis';
import { config } from '../../config';
import { broadcast, type WsEventType, type WsEventPayload } from './ws-store';

const CHANNEL = 'socialpilot:ws:events';

let subscriber: Redis | null = null;
let publisher: Redis | null = null;
let initialized = false;

/**
 * Initialize the Redis pub/sub connections and start subscribing.
 * Called once during backend startup.
 */
export function initEventBus(): void {
  if (initialized) return;
  initialized = true;

  try {
    subscriber = new Redis(config.redis.url);
    publisher = new Redis(config.redis.url);

    subscriber.subscribe(CHANNEL, (err, count) => {
      if (err) {
        console.error('[EventBus] Failed to subscribe to Redis channel:', err.message);
        return;
      }
      console.log(`[EventBus] Subscribed to ${CHANNEL} (${count} channels)`);
    });

    subscriber.on('message', (channel, message) => {
      if (channel !== CHANNEL) return;
      try {
        const event = JSON.parse(message) as { type: WsEventType; payload: WsEventPayload };
        broadcast(event.type, event.payload);
      } catch {
        // ignore malformed messages
      }
    });

    subscriber.on('error', (err) => {
      console.error('[EventBus] Subscriber error:', err.message);
    });

    publisher.on('error', (err) => {
      console.error('[EventBus] Publisher error:', err.message);
    });
  } catch (err) {
    console.error('[EventBus] Failed to initialize:', err instanceof Error ? err.message : err);
  }
}

/**
 * Publish a WebSocket event to the Redis channel.
 * Workers call this after creating new inbox items, approval requests, etc.
 */
export async function publishWsEvent(type: WsEventType, payload: WsEventPayload): Promise<void> {
  // If publisher isn't initialized, create a one-off connection
  if (!publisher) {
    try {
      publisher = new Redis(config.redis.url);
      publisher.on('error', () => { /* ignore */ });
    } catch {
      return; // Redis not available
    }
  }

  try {
    const message = JSON.stringify({ type, payload });
    await publisher.publish(CHANNEL, message);
  } catch (err) {
    console.error('[EventBus] Failed to publish event:', err instanceof Error ? err.message : err);
  }
}

/**
 * Clean up Redis connections (call during graceful shutdown).
 */
export async function closeEventBus(): Promise<void> {
  try {
    if (subscriber) {
      await subscriber.unsubscribe(CHANNEL);
      subscriber.disconnect();
      subscriber = null;
    }
    if (publisher) {
      publisher.disconnect();
      publisher = null;
    }
  } catch {
    // ignore cleanup errors
  }
  initialized = false;
}
