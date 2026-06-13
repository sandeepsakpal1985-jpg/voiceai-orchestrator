/**
 * Missed Opportunities module integration tests.
 *
 * Tests: list, detect, recover lead, stats, resolve/dismiss.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import missedOppRoutes from '../modules/missed-opportunities/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(missedOppRoutes, { prefix: '/api/missed-opportunities' });
  await app.ready();

  user = await createTestUser({ email: 'missed-opp-test@test.ai', name: 'Missed Opp Test User' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Missed Opportunities — POST /detect', () => {
  it('should detect pricing questions from pending comments', async () => {
    const prisma = getTestPrisma();
    // Create a pending comment with pricing question
    await prisma.socialComment.create({
      data: {
        userId: user.id, authorId: 'cust_pricing', authorName: 'Pricing Customer',
        content: 'How much does your plan cost? What is the price?', platform: 'instagram',
        postId: 'post_1', replyStatus: 'pending', category: 'sales_inquiry',
      },
    });

    const res = await app.inject({ method: 'POST', url: '/api/missed-opportunities/detect', headers });
    const body = expectSuccess(res);
    // Should detect the pricing question and possibly others
    expect(body.data.detected).toBeGreaterThanOrEqual(1);
    expect(body.data.items.some((i: any) => i.type === 'pricing_unanswered')).toBe(true);
  });

  it('should detect purchase intent from pending comments', async () => {
    const prisma = getTestPrisma();
    await prisma.socialComment.create({
      data: {
        userId: user.id, authorId: 'cust_buy', authorName: 'Buy Customer',
        content: 'I want to subscribe to your service!', platform: 'instagram',
        postId: 'post_2', replyStatus: 'pending',
      },
    });

    const res = await app.inject({ method: 'POST', url: '/api/missed-opportunities/detect', headers });
    const body = expectSuccess(res);
    expect(body.data.items.some((i: any) => i.type === 'purchase_intent_unanswered')).toBe(true);
  });

  it('should avoid creating duplicate detected opportunities', async () => {
    // Run detection twice — second run should skip duplicates
    const res1 = await app.inject({ method: 'POST', url: '/api/missed-opportunities/detect', headers });
    const body1 = expectSuccess(res1);
    const firstCreated = body1.data.created;

    const res2 = await app.inject({ method: 'POST', url: '/api/missed-opportunities/detect', headers });
    const body2 = expectSuccess(res2);
    // Second run should not create duplicates
    expect(body2.data.created).toBe(0);
  });
});

describe('Missed Opportunities — GET /', () => {
  it('should list all missed opportunities', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/missed-opportunities', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/missed-opportunities?status=open', headers });
    const body = expectSuccess(res);
    for (const item of body.data) {
      expect(item.status).toBe('open');
    }
  });

  it('should filter by type', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/missed-opportunities?type=pricing_unanswered', headers });
    const body = expectSuccess(res);
    for (const item of body.data) {
      expect(item.type).toBe('pricing_unanswered');
    }
  });
});

describe('Missed Opportunities — GET /stats', () => {
  it('should return opportunity stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/missed-opportunities/stats', headers });
    const body = expectSuccess(res);
    expect(body.data).toHaveProperty('open');
    expect(body.data).toHaveProperty('resolved');
    expect(body.data).toHaveProperty('dismissed');
    expect(body.data).toHaveProperty('totalPotentialValue');
    expect(body.data.open).toBeGreaterThanOrEqual(1);
  });
});

describe('Missed Opportunities — PUT /:id', () => {
  let oppId: string;

  beforeAll(async () => {
    const prisma = getTestPrisma();
    const opp = await prisma.missedOpportunity.findFirst({ where: { userId: user.id } });
    oppId = opp!.id;
  });

  it('should dismiss a missed opportunity', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/missed-opportunities/${oppId}`,
      headers, payload: { status: 'dismissed' },
    });
    const body = expectSuccess(res);
    expect(body.data.status).toBe('dismissed');
  });

  it('should return 404 for non-existent opportunity', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/missed-opportunities/non-existent-id',
      headers, payload: { status: 'resolved' },
    });
    expectError(res, 404);
  });
});

describe('Missed Opportunities — POST /:id/recover', () => {
  let oppId: string;

  beforeAll(async () => {
    const prisma = getTestPrisma();
    // Create a fresh open opportunity for recovery test
    const opp = await prisma.missedOpportunity.create({
      data: {
        userId: user.id, type: 'missed_follow_up',
        description: 'Hot lead not contacted in 7+ days',
        customerHandle: 'recover_customer', customerName: 'Recover Customer',
        platform: 'instagram', status: 'open',
        potentialValue: 200,
        recommendedAction: 'Send personalized follow-up',
      },
    });
    oppId = opp.id;
  });

  it('should create a lead from a missed opportunity', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/missed-opportunities/${oppId}/recover`, headers,
    });
    const body = expectSuccess(res);
    expect(body.data.lead).toBeDefined();
    expect(body.data.lead.name).toBe('Recover Customer');
    expect(body.data.lead.tags).toContain('recovered');
    expect(body.data.lead.tags).toContain('missed_opportunity');
  });

  it('should mark the opportunity as resolved after recovery', async () => {
    const prisma = getTestPrisma();
    const opp = await prisma.missedOpportunity.findUnique({ where: { id: oppId } });
    expect(opp?.status).toBe('resolved');
    expect(opp?.resolvedAt).toBeDefined();
  });

  it('should return 404 for non-existent opportunity', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/missed-opportunities/invalid-id/recover', headers,
    });
    expectError(res, 404);
  });
});
