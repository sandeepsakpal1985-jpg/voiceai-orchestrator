/**
 * Automation module integration tests.
 *
 * Tests keyword triggers CRUD, comment-to-DM, auto-like, and AI copilot.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import automationRoutes from '../modules/automation/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(automationRoutes, { prefix: '/api/automation' });
  await app.ready();

  user = await createTestUser({ email: 'auto-test@test.ai', name: 'Auto Test User' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Automation Module — Keyword Triggers', () => {
  it('should return empty triggers initially', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/automation/triggers', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('should save triggers', async () => {
    const triggers = [
      {
        id: 't1',
        keyword: 'price',
        matchType: 'contains' as const,
        action: 'auto_reply_comment' as const,
        replyTemplate: 'Check our pricing page!',
        enabled: true,
        priority: 0,
        platform: 'all' as const,
      },
      {
        id: 't2',
        keyword: 'discount',
        matchType: 'exact' as const,
        action: 'send_dm' as const,
        replyTemplate: 'We have special offers!',
        enabled: true,
        priority: 1,
        platform: 'instagram' as const,
      },
    ];

    const res = await app.inject({
      method: 'PUT',
      url: '/api/automation/triggers',
      headers,
      payload: { triggers },
    });
    const body = expectSuccess(res);
    expect(body.data.triggers.length).toBe(2);
  });

  it('should retrieve saved triggers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/automation/triggers', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(2);
    expect(body.data[0].keyword).toBe('price');
    expect(body.data[1].keyword).toBe('discount');
  });

  it('should update existing triggers', async () => {
    const triggers = [
      {
        id: 't1',
        keyword: 'pricing',
        matchType: 'contains' as const,
        action: 'auto_reply_comment' as const,
        replyTemplate: 'Updated pricing reply!',
        enabled: false,
        priority: 0,
        platform: 'all' as const,
      },
    ];

    const res = await app.inject({
      method: 'PUT',
      url: '/api/automation/triggers',
      headers,
      payload: { triggers },
    });
    const body = expectSuccess(res);
    expect(body.data.triggers.length).toBe(1);
    expect(body.data.triggers[0].keyword).toBe('pricing');
    expect(body.data.triggers[0].enabled).toBe(false);
  });
});

describe('Automation Module — Auto Like', () => {
  it('should reject auto-like without Meta connection', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/automation/auto-like',
      headers,
      payload: { commentId: 'test_123', platform: 'instagram' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Meta connection');
  });
});

describe('Automation Module — Comment-to-DM', () => {
  it('should send DM to comment author', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/automation/comment-to-dm',
      headers,
      payload: {
        commentId: 'cmt_001',
        authorId: 'ig_user_123',
        platform: 'instagram',
        message: 'Thanks for your interest! Check your DMs.',
      },
    });
    const body = expectSuccess(res);
    expect(body.data.dmSent).toBe(true);
    expect(body.data.conversationId).toBeDefined();
    expect(body.data.customerId).toBe('ig_user_123');
  });

  it('should reuse existing DM conversation', async () => {
    // Send DM to same user - should create conversation only once
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/automation/comment-to-dm',
      headers,
      payload: {
        commentId: 'cmt_002',
        authorId: 'ig_user_123',
        platform: 'instagram',
        message: 'Following up on your interest!',
      },
    });
    const body1 = JSON.parse(res1.body);

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/automation/comment-to-dm',
      headers,
      payload: {
        commentId: 'cmt_003',
        authorId: 'ig_user_123',
        platform: 'instagram',
        message: 'Another follow-up!',
      },
    });
    const body2 = JSON.parse(res2.body);

    // Same conversation should be reused
    expect(body1.data.conversationId).toBe(body2.data.conversationId);
  });
});

describe('Automation Module — Auth Guard', () => {
  it('should reject unauthenticated trigger requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/automation/triggers' });
    expectError(res, 401);
  });

  it('should reject unauthenticated copilot requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/automation/copilot',
      payload: { content: 'test', context: {} },
    });
    expectError(res, 401);
  });
});
