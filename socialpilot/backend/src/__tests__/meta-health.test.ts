/**
 * Meta Health module integration tests.
 *
 * Tests health overview generation, proactive health check, and connection history.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import metaHealthRoutes from '../modules/meta-health/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(metaHealthRoutes, { prefix: '/api/meta-health' });
  await app.ready();

  user = await createTestUser({ email: 'health-test@test.ai', name: 'Health User' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Meta Health Module — Overview', () => {
  it('should return overview with no connections', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta-health/overview', headers });
    const body = expectSuccess(res);
    expect(body.data.overallScore).toBeDefined();
    expect(body.data.connections).toEqual([]);
    expect(body.data.webhooks.total).toBe(0);
    expect(body.data.alerts.length).toBeGreaterThanOrEqual(1);
    // Should have a critical alert about no connections
    expect(body.data.alerts.some((a: any) => a.severity === 'critical')).toBe(true);
  });

  it('should return overview with connection data when connections exist', async () => {
    // Create a test Meta connection
    const prisma = getTestPrisma();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.metaConnection.create({
      data: {
        userId: user.id,
        facebookPageId: 'fb_page_1',
        facebookPageName: 'Test Page',
        accessToken: 'test_token',
        tokenExpiresAt: futureDate,
        status: 'active',
        instagramAccountId: 'ig_acct_1',
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/meta-health/overview', headers });
    const body = expectSuccess(res);
    expect(body.data.connections.length).toBe(1);
    expect(body.data.connections[0].status).toBe('active');
    expect(body.data.connections[0].platform).toBe('instagram');
    expect(body.data.connections[0].tokenDaysRemaining).toBeGreaterThan(0);
  });
});

describe('Meta Health Module — Health Check', () => {
  it('should reject health check when no connections exist', async () => {
    // Clean up first
    const prisma = getTestPrisma();
    await prisma.metaConnection.deleteMany({ where: { userId: user.id } });

    const res = await app.inject({ method: 'POST', url: '/api/meta-health/check', headers });
    expect(res.statusCode).toBe(400);
  });

  it('should attempt health check on connections', async () => {
    // Add a connection back
    const prisma = getTestPrisma();
    await prisma.metaConnection.create({
      data: {
        userId: user.id,
        facebookPageId: 'fb_page_2',
        accessToken: 'invalid_token',
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active',
      },
    });

    const res = await app.inject({ method: 'POST', url: '/api/meta-health/check', headers });
    const body = JSON.parse(res.body);
    // Should succeed even if API calls fail (graceful handling)
    expect(body.success).toBe(true);
    expect(body.data.checked).toBe(1);
    expect(body.data.results.length).toBe(1);
  });
});

describe('Meta Health Module — History', () => {
  it('should return connection history', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta-health/history', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].facebookPageName).toBeDefined();
  });

  it('should include webhook counts in history', async () => {
    const prisma = getTestPrisma();
    const conn = await prisma.metaConnection.findFirst({ where: { userId: user.id } });
    if (conn) {
      // Create a webhook for the connection
      await prisma.metaWebhook.create({
        data: {
          userId: user.id,
          connectionId: conn.id,
          eventType: 'comment',
          rawPayload: { test: true },
          processed: true,
          processedAt: new Date(),
        },
      });
    }

    const res = await app.inject({ method: 'GET', url: '/api/meta-health/history', headers });
    const body = expectSuccess(res);
    const connWithWebhooks = body.data.find((c: any) => c._count?.webhooks > 0);
    expect(connWithWebhooks).toBeDefined();
  });
});
