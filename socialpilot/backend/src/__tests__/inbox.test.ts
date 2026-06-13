/**
 * Inbox module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import inboxRoutes from '../modules/inbox/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(inboxRoutes, { prefix: '/api/inbox' });
  await app.ready();
  user = await createTestUser({ email: 'inbox-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Inbox Module', () => {
  let itemId: string;

  beforeAll(async () => {
    const prisma = getTestPrisma();
    const item = await prisma.inboxItem.create({
      data: {
        userId: user.id,
        type: 'comment',
        priority: 'high',
        status: 'unread',
        customerName: 'John Doe',
        customerHandle: 'john_doe',
        platform: 'instagram',
        content: 'When is your next sale?',
      },
    });
    itemId = item.id;

    // Create items in order: urgent should appear first, then high, then medium
    await prisma.inboxItem.create({
      data: {
        userId: user.id, type: 'dm', priority: 'medium', status: 'read',
        customerName: 'Jane', customerHandle: 'jane', platform: 'facebook',
        content: 'Thanks for the info!',
      },
    });
    await prisma.inboxItem.create({
      data: {
        userId: user.id, type: 'escalation', priority: 'urgent', status: 'unread',
        customerName: 'Angry User', customerHandle: 'angry', platform: 'instagram',
        content: 'This is unacceptable!',
      },
    });
  });

  it('should list inbox items', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/inbox', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(3);
    // Items are ordered by creation date desc — urgent should appear before medium
    const priorities = body.data.map((i: any) => i.priority);
    expect(body.data.length).toBe(3);
    expect(priorities).toContain('urgent');
    expect(priorities).toContain('high');
    expect(priorities).toContain('medium');
  });

  it('should filter by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/inbox?status=unread', headers });
    const body = expectSuccess(res);
    expect(body.data.every((i: any) => i.status === 'unread')).toBe(true);
  });

  it('should filter by priority', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/inbox?priority=high', headers });
    const body = expectSuccess(res);
    expect(body.data.every((i: any) => i.priority === 'high')).toBe(true);
  });

  it('should get a specific item (and mark it as read)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/inbox/${itemId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.id).toBe(itemId);
    // Should be marked as read now
    const res2 = await app.inject({ method: 'GET', url: `/api/inbox/${itemId}`, headers });
    const body2 = JSON.parse(res2.body);
    expect(body2.data.status).toBe('read');
  });

  it('should return 404 for non-existent item', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/inbox/bad-id', headers });
    expectError(res, 404);
  });

  it('should update internal note', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/inbox/${itemId}/note`,
      headers,
      payload: { internalNote: 'Following up with this customer' },
    });
    const body = expectSuccess(res);
    expect(body.data.internalNote).toBe('Following up with this customer');
  });

  it('should assign item to someone', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/inbox/${itemId}/assign`,
      headers,
      payload: { assignedTo: 'agent-1' },
    });
    const body = expectSuccess(res);
    expect(body.data.assignedTo).toBe('agent-1');
  });

  it('should update status', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/inbox/${itemId}/status`,
      headers,
      payload: { status: 'resolved' },
    });
    const body = expectSuccess(res);
    expect(body.data.status).toBe('resolved');
  });
});
