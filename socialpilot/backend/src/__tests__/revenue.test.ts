/**
 * Revenue analytics module integration tests.
 *
 * Tests: summary (periodic), trend (chart data), funnel (conversion pipeline),
 * executive-summary (natural language).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import revenueRoutes from '../modules/revenue/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(revenueRoutes, { prefix: '/api/revenue' });
  await app.ready();

  user = await createTestUser({ email: 'revenue-test@test.ai', name: 'Revenue Test User' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Revenue — GET /summary', () => {
  it('should return 0 revenue when no data exists', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/revenue/summary', headers });
    const body = expectSuccess(res);
    expect(body.data.totalRevenue).toBe(0);
    expect(body.data.dealsWon).toBe(0);
    expect(body.data.leadsGenerated).toBe(0);
    expect(body.data.period).toBe('monthly');
  });

  it('should support daily/weekly/monthly/yearly periods', async () => {
    for (const period of ['daily', 'weekly', 'monthly', 'yearly']) {
      const res = await app.inject({ method: 'GET', url: `/api/revenue/summary?period=${period}`, headers });
      const body = expectSuccess(res);
      expect(body.data.period).toBe(period);
    }
  });

  it('should calculate revenue from won deals', async () => {
    const prisma = getTestPrisma();
    // Create a lead for the deal (non-AI source so it won't be counted as AI-attributed)
    const lead = await prisma.lead.create({
      data: {
        userId: user.id, name: 'Jane', socialHandle: 'jane_ig',
        platform: 'instagram', source: 'manual', category: 'warm',
        leadScore: 80, lastContactAt: new Date(),
      },
    });
    // Create a won deal with revenue
    await prisma.cRMDeal.create({
      data: {
        userId: user.id, leadId: lead.id,
        title: 'Won Deal', stage: 'won', value: 5000, revenue: 5000,
        createdAt: new Date(),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/revenue/summary?period=yearly', headers });
    const body = expectSuccess(res);
    expect(body.data.totalRevenue).toBe(5000);
    expect(body.data.dealsWon).toBe(1);
  });

  it('should calculate AI-attributed revenue percentage', async () => {
    const prisma = getTestPrisma();
    // Create a comment-sourced lead with a won deal
    const lead = await prisma.lead.create({
      data: {
        userId: user.id, name: 'Bob', socialHandle: 'bob_ig',
        platform: 'instagram', source: 'comment', category: 'hot',
        leadScore: 90, lastContactAt: new Date(),
      },
    });
    await prisma.cRMDeal.create({
      data: {
        userId: user.id, leadId: lead.id,
        title: 'AI Deal', stage: 'won', value: 3000, revenue: 3000,
        createdAt: new Date(),
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/revenue/summary?period=yearly', headers });
    const body = expectSuccess(res);
    // 3000 AI revenue out of 8000 total (5000+3000) = 37.5% → 38%
    expect(body.data.aiAttributedRevenue).toBe(3000);
    expect(body.data.aiRevenuePercentage).toBeGreaterThan(0);
  });
});

describe('Revenue — GET /trend', () => {
  it('should return monthly revenue trend data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/revenue/trend', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    // Should have at least the current month entry if deals exist
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('month');
      expect(body.data[0]).toHaveProperty('revenue');
      expect(body.data[0]).toHaveProperty('count');
    }
  });
});

describe('Revenue — GET /funnel', () => {
  it('should return conversion funnel data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/revenue/funnel', headers });
    const body = expectSuccess(res);
    expect(body.data).toHaveProperty('leads');
    expect(body.data).toHaveProperty('opportunities');
    expect(body.data).toHaveProperty('won');
    expect(body.data).toHaveProperty('lost');
    expect(typeof body.data.leadToOpportunity).toBe('number');
    expect(typeof body.data.opportunityToWon).toBe('number');
  });
});

describe('Revenue — GET /executive-summary', () => {
  it('should return natural language executive summary', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/revenue/executive-summary', headers });
    const body = expectSuccess(res);
    expect(body.data).toHaveProperty('summary');
    expect(typeof body.data.summary).toBe('string');
    expect(body.data.summary.length).toBeGreaterThan(0);
    expect(body.data).toHaveProperty('period');
    expect(body.data.metrics).toHaveProperty('leadsGenerated');
    expect(body.data.metrics).toHaveProperty('totalRevenue');
    expect(body.data.metrics).toHaveProperty('aiRevenuePercentage');
  });

  it('should support period parameter', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/revenue/executive-summary?period=weekly', headers });
    const body = expectSuccess(res);
    expect(body.data.period).toBe('weekly');
  });
});
