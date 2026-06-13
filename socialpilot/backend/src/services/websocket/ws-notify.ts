/**
 * MetaPilot AI — WebSocket Notification Route Registration
 *
 * Registers the /ws/notifications endpoint on the Fastify app.
 * Uses ws-store.ts for the underlying client management and broadcast.
 * This file has Fastify-specific dependencies.
 */

import { type FastifyInstance } from 'fastify';
import { registerClient, broadcast } from './ws-store';
import type { WsEvent } from './ws-store';

/**
 * Register the WebSocket notification endpoint on the Fastify app.
 * Auth is handled via ?token= query param — verifies JWT on upgrade.
 *
 * Route: GET /ws/notifications
 * Query: ?token=<jwt_token>
 */
export function registerWsNotificationRoute(app: FastifyInstance): void {
  app.get('/ws/notifications', { websocket: true }, (socket, request) => {
    // Authenticate via token query param
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Authentication required — provide ?token= query param');
      return;
    }

    try {
      app.jwt.verify(token);
    } catch {
      socket.close(4001, 'Invalid or expired token');
      return;
    }

    registerClient(socket);

    // Send a welcome confirmation so the client knows it connected
    const welcome: WsEvent = {
      type: 'system:notification',
      payload: {
        system: {
          title: 'Connected',
          message: 'Real-time notifications active',
          severity: 'info',
        },
      },
      timestamp: new Date().toISOString(),
    };
    socket.send(JSON.stringify(welcome));

    // Handle client ping for keepalive
    socket.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
}

export { broadcast, closeAllConnections } from './ws-store';
