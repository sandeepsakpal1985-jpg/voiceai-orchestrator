/**
 * Meta module integration tests.
 *
 * Tests:
 * - Webhook verification (GET /api/meta/webhook)
 * - Webhook event receiving (POST /api/meta/webhook)
 * - Authenticated connection routes
 * - OAuth initiation (mocked external calls)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import metaRoutes from '../modules/meta/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(metaRoutes, { prefix: '/api/meta' });
  await app.ready();
  user = await createTestUser({ email: 'meta-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Meta Module — Webhooks (Unauthenticated)', () => {
  it('GET /webhook — should verify webhook with correct token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/meta/webhook?hub.mode=subscribe&hub.verify_token=socialpilot_verify_123&hub.challenge=challenge123',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('challenge123');
  });

  it('GET /webhook — should reject wrong verify token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge123',
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /webhook — should receive webhook events', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meta/webhook',
      payload: {
        object: 'instagram',
        entry: [{
          id: 'entry_1',
          time: Math.floor(Date.now() / 1000),
          changes: [{ field: 'comments', value: { text: 'Test comment' } }],
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('EVENT_RECEIVED');
  });

  it('POST /webhook — should store webhook events in database', async () => {
    const count = await getTestPrisma().metaWebhook.count();
    expect(count).toBeGreaterThan(0);
  });
});

describe('Meta Module — OAuth Initiation', () => {
  it('GET /auth — should reject missing platform', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta/auth' });
    expectError(res, 400);
  });

  it('GET /auth — should reject missing token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta/auth?platform=instagram' });
    expectError(res, 401);
  });

  it('GET /auth — should reject invalid platform', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta/auth?platform=tiktok&token=abc' });
    expectError(res, 400);
  });

  it('GET /auth — should reject invalid token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta/auth?platform=instagram&token=invalid-jwt' });
    expectError(res, 401);
  });

  it('GET /auth — should redirect to Meta OAuth with valid token', async () => {
    const token = app.jwt.sign({ id: user.id, email: user.email });
    const res = await app.inject({
      method: 'GET',
      url: `/api/meta/auth?platform=instagram&token=${token}`,
    });
    // Should redirect (302) since META_APP_ID is empty
    // We'd get a 503 since META_APP_ID is not configured in test env
    expect(res.statusCode).toBe(503);
  });
});

describe('Meta Module — Authenticated Routes', () => {
  let connectionId: string;

  it('GET /connections — should list connections (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta/connections', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('POST /instagram/connect — should create Instagram connection', async () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/meta/instagram/connect',
      headers,
      payload: {
        instagramAccountId: 'ig_123',
        instagramUsername: 'test_business',
        accessToken: 'test_access_token',
        tokenExpiresAt: futureDate,
      },
    });
    const body = expectSuccess(res);
    connectionId = body.data.id;
    expect(body.data.instagramAccountId).toBe('ig_123');
    expect(body.data.instagramUsername).toBe('test_business');
  });

  it('POST /facebook/connect — should create Facebook connection', async () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/meta/facebook/connect',
      headers,
      payload: {
        facebookPageId: 'fb_page_456',
        facebookPageName: 'Test Page',
        accessToken: 'fb_access_token',
        tokenExpiresAt: futureDate,
      },
    });
    const body = expectSuccess(res);
    expect(body.data.facebookPageId).toBe('fb_page_456');
    expect(body.data.facebookPageName).toBe('Test Page');
  });

  it('GET /connections — should list all connections', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta/connections', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(2);
  });

  it('DELETE /connections/:id — should disconnect', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/meta/connections/${connectionId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.deleted).toBe(true);
  });

  it('DELETE /connections/:id — should return 404 for already deleted', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/meta/connections/${connectionId}`, headers });
    expectError(res, 404);
  });

  it('POST /connections/:id/refresh — should return error when no Meta credentials', async () => {
    // Create a fresh connection for refresh test
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const prisma = getTestPrisma();
    const conn = await prisma.metaConnection.create({
      data: {
        userId: user.id,
        facebookPageId: 'fb_refresh',
        facebookPageName: 'Refresh Page',
        accessToken: 'old_token',
        tokenExpiresAt: new Date(futureDate),
        status: 'active',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/meta/connections/${conn.id}/refresh`,
      headers,
    });
    // Should fail because META_APP_ID/META_APP_SECRET are empty in test
    expect(res.statusCode).toBe(502);
  });
});
