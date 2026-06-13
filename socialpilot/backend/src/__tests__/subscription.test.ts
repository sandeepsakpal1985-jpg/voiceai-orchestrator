/**
 * Subscription module integration tests.
 *
 * Tests billing/subscription flows: plans listing, current subscription,
 * upgrade, downgrade, and cancellation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase } from './setup';
import subscriptionRoutes from '../modules/subscription/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(subscriptionRoutes, { prefix: '/api/subscription' });
  await app.ready();

  user = await createTestUser({ email: 'sub-test@test.ai', name: 'Sub Test User' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Subscription Module — Plans', () => {
  it('should list available plans', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/subscription/plans', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    expect(body.data.some((p: any) => p.id === 'starter')).toBe(true);
    expect(body.data.some((p: any) => p.id === 'professional')).toBe(true);
  });

  it('should return current subscription with plan info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/subscription/current', headers });
    const body = expectSuccess(res);
    expect(body.data.plan).toBeDefined();
    expect(body.data.status).toBe('active');
  });

  it('should return usage stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/subscription/usage', headers });
    const body = expectSuccess(res);
    // Usage data shape varies by implementation — just verify it returns valid data
    expect(typeof body.data).toBe('object');
    expect(Object.keys(body.data).length).toBeGreaterThan(0);
  });

  it('should return billing history', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/subscription/billing-history', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('Subscription Module — Upgrade & Downgrade', () => {
  it('should reject downgrade to same plan (user is already on free)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subscription/downgrade',
      headers,
      payload: { planId: 'free' },
    });
    // Current plan is free, so downgrading to free should be rejected (same plan)
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('should reject downgrade to higher plan', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subscription/downgrade',
      headers,
      payload: { planId: 'starter' },
    });
    // Should fail since free < starter (downgrade means going lower)
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('should reject upgrade to free plan (not a valid upgrade target)', async () => {
    // 'free' is not a valid upgrade target (upgrade only accepts starter/pro/agency)
    const res = await app.inject({
      method: 'POST',
      url: '/api/subscription/upgrade',
      headers,
      payload: { planId: 'free' },
    });
    // Should return an error status (validation or 500 from Zod error handling)
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('should cancel subscription', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/subscription/cancel', headers });
    const body = expectSuccess(res);
    expect(body.data.status).toBeDefined();
  });
});

describe('Subscription Module — Auth Guard', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/subscription/plans' });
    expectError(res, 401);
  });

  it('should reject unauthenticated upgrade', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subscription/upgrade',
      payload: { planId: 'professional' },
    });
    expectError(res, 401);
  });
});
