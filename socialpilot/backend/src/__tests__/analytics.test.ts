/**
 * Analytics module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import analyticsRoutes from '../modules/analytics/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.ready();
  user = await createTestUser({ email: 'analytics-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Analytics Module', () => {
  beforeAll(async () => {
    const prisma = getTestPrisma();
    // Seed some test data for analytics
    await prisma.socialComment.createMany({
      data: [
        { userId: user.id, platform: 'instagram', postId: 'p1', content: 'Nice!', authorName: 'A', authorId: 'author_a', replyStatus: 'replied' },
        { userId: user.id, platform: 'instagram', postId: 'p2', content: 'How much?', authorName: 'B', authorId: 'author_b', replyStatus: 'pending' },
      ],
    });
    await prisma.dMConversation.createMany({
      data: [
        { userId: user.id, platform: 'facebook', customerId: 'c1', status: 'resolved' },
        { userId: user.id, platform: 'instagram', customerId: 'd1', status: 'active' },
      ],
    });
    await prisma.lead.createMany({
      data: [
        { userId: user.id, name: 'Lead 1', socialHandle: 'l1', platform: 'instagram', source: 'comment', category: 'hot', leadScore: 90 },
        { userId: user.id, name: 'Lead 2', socialHandle: 'l2', platform: 'facebook', source: 'dm', category: 'warm', leadScore: 60 },
        { userId: user.id, name: 'Lead 3', socialHandle: 'l3', platform: 'instagram', source: 'comment', category: 'cold', leadScore: 20 },
      ],
    });
    await prisma.cRMDeal.create({
      data: { userId: user.id, title: 'Won Deal', stage: 'won', value: 10000 },
    });
    await prisma.escalationTicket.create({
      data: { userId: user.id, customerId: 'complaint_customer', reason: 'Complaint', severity: 'high', status: 'open' },
    });
  });

  it('GET /api/analytics/overview — should return dashboard metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/overview', headers });
    const body = expectSuccess(res);
    expect(body.data.period).toBe('weekly');
    expect(body.data.comments).toBeDefined();
    expect(body.data.comments.total).toBe(2);
    expect(body.data.dms.total).toBe(2);
    expect(body.data.leads.total).toBe(3);
    expect(body.data.leads.hot).toBe(1);
    expect(body.data.escalations.total).toBe(1);
    expect(body.data.deals.won).toBe(1);
    expect(body.data.estimatedRevenue).toBe(10000);
  });

  it('GET /api/analytics/leads — should return lead metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/leads', headers });
    const body = expectSuccess(res);
    expect(body.data.total).toBe(3);
    expect(body.data.cold).toBe(1);
    expect(body.data.warm).toBe(1);
    expect(body.data.hot).toBe(1);
    expect(body.data.vip).toBe(0);
    expect(body.data.avgScore).toBeGreaterThan(0);
  });

  it('GET /api/analytics/growth — should return growth data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/growth', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data.dailyLeads)).toBe(true);
    expect(body.data.dailyLeads.length).toBeGreaterThan(0);
  });

  it('GET /api/analytics/insights — should return insights (empty initially)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/insights', headers });
    const body = expectSuccess(res);
    expect(body.data.insights).toBeDefined();
    expect(Array.isArray(body.data.insights)).toBe(true);
  });

  it('POST /api/analytics/insights/generate — should generate insights', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/analytics/insights/generate',
      headers,
      payload: { period: 'weekly' },
    });
    const body = expectSuccess(res);
    expect(body.data.summary).toBeDefined();
    expect(Array.isArray(body.data.insights)).toBe(true);
    expect(body.data.insights.length).toBeGreaterThanOrEqual(4);
    expect(body.data.recommendations.length).toBeGreaterThan(0);
  });

  it('GET /api/analytics/insights — should return generated insights', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/analytics/insights', headers });
    const body = expectSuccess(res);
    expect(body.data.insights.length).toBeGreaterThan(0);
  });
});
