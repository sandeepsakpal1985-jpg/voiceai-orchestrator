/**
 * DMs module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import dmRoutes from '../modules/dms/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(dmRoutes, { prefix: '/api/dms' });
  await app.ready();
  user = await createTestUser({ email: 'dms-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('DMs Module', () => {
  let conversationId: string;

  it('should list conversations (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dms', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBe(0);
  });

  it('should reject unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dms' });
    expect(res.statusCode).toBe(401);
  });

  it('should create a conversation via Prisma for testing', async () => {
    const prisma = getTestPrisma();
    const conv = await prisma.dMConversation.create({
      data: {
        userId: user.id,
        platform: 'instagram',
        customerId: 'dm_contact_1',
        status: 'active',
      },
    });
    conversationId = conv.id;
    expect(conversationId).toBeDefined();
  });

  it('should list conversations with data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dms', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBeDefined();
  });

  it('should get a specific conversation with messages', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/dms/${conversationId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.id).toBe(conversationId);
    expect(Array.isArray(body.data.messages)).toBe(true);
  });

  it('should return 404 for non-existent conversation', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dms/bad-id', headers });
    expectError(res, 404);
  });

  it('should send a message in a conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/dms/${conversationId}/messages`,
      headers,
      payload: { content: 'Hello! How can I help you?' },
    });
    const body = expectSuccess(res);
    expect(body.data.content).toBe('Hello! How can I help you?');
    expect(body.data.role).toBe('assistant');
  });

  it('should list messages after sending one', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/dms/${conversationId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.messages.length).toBe(1);
  });

  it('should filter conversations by status', async () => {
    const prisma = getTestPrisma();
    // Create a resolved conversation
    await prisma.dMConversation.create({
      data: {
        userId: user.id, platform: 'facebook',
        customerId: 'resolved_1', status: 'resolved',
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/dms?status=active', headers });
    const body = expectSuccess(res);
    expect(body.data.every((c: any) => c.status === 'active')).toBe(true);
  });
});
