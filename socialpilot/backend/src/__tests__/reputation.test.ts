/**
 * Reputation monitoring module integration tests.
 *
 * Tests: overview dashboard, sentiment trend, alerts list.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import reputationRoutes from '../modules/reputation/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(reputationRoutes, { prefix: '/api/reputation' });
  await app.ready();

  user = await createTestUser({ email: 'reputation-test@test.ai', name: 'Reputation Test User' });
  headers = authHeaders(app, user);

  // Seed comments with sentiment for reputation scoring
  const prisma = getTestPrisma();
  const commentData = [];
  for (let i = 0; i < 10; i++) {
    const sentiment = i < 5 ? 0.6 : i < 8 ? 0.0 : -0.5;
    commentData.push({
      userId: user.id, authorId: `user_${i}`, authorName: `User ${i}`,
      content: `Comment ${i} with sentiment`, platform: 'instagram',
      postId: `post_${i}`, replyStatus: 'replied', sentiment,
      createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
    });
  }
  await prisma.socialComment.createMany({ data: commentData });

  // Seed escalation tickets (some with reputationAlert)
  await prisma.escalationTicket.createMany({
    data: [
      { userId: user.id, customerId: 'angry_user', reason: 'Critical complaint', context: 'User angry about billing', severity: 'critical', status: 'open', reputationAlert: true },
      { userId: user.id, customerId: 'curious_user', reason: 'Minor issue', context: 'Question about features', severity: 'low', status: 'resolved', reputationAlert: false },
      { userId: user.id, customerId: 'review_user', reason: 'Negative review', context: 'Bad product experience', severity: 'high', status: 'open', reputationAlert: true },
    ],
  });
});

afterAll(async () => {
  await app.close();
});

describe('Reputation — GET /overview', () => {
  it('should return reputation overview with score and sentiment breakdown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reputation/overview', headers });
    const body = expectSuccess(res);
    const data = body.data;

    expect(data).toHaveProperty('reputationScore');
    expect(typeof data.reputationScore).toBe('number');
    expect(data.reputationScore).toBeGreaterThanOrEqual(0);
    expect(data.reputationScore).toBeLessThanOrEqual(100);

    expect(data).toHaveProperty('positivePercent');
    expect(data).toHaveProperty('negativePercent');
    expect(data).toHaveProperty('neutralPercent');
    expect(data.positivePercent + data.negativePercent + data.neutralPercent).toBe(100);

    expect(data).toHaveProperty('crisis');
    expect(data.crisis).toBe(1); // 1 critical escalation

    expect(data).toHaveProperty('totalInteractions');
    expect(data.totalInteractions).toBe(10);
  });

  it('should include active alerts from reputation-alerted escalations', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reputation/overview', headers });
    const body = expectSuccess(res);
    const data = body.data;

    expect(data).toHaveProperty('activeAlerts');
    expect(data.activeAlerts).toBe(2); // 2 open reputation alerts
    expect(Array.isArray(data.recentAlerts)).toBe(true);
    expect(data.recentAlerts.length).toBe(2);
  });

  it('should have trending data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reputation/overview', headers });
    const body = expectSuccess(res);
    expect(body.data).toHaveProperty('trend');
    expect(typeof body.data.trend).toBe('number');
  });
});

describe('Reputation — GET /sentiment-trend', () => {
  it('should return daily sentiment trend data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reputation/sentiment-trend', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const entry = body.data[0];
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('avgSentiment');
      expect(entry).toHaveProperty('count');
    }
  });

  it('should return entries sorted by date ascending', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reputation/sentiment-trend', headers });
    const body = expectSuccess(res);
    for (let i = 1; i < body.data.length; i++) {
      expect(body.data[i].date >= body.data[i - 1].date).toBe(true);
    }
  });
});

describe('Reputation — GET /alerts', () => {
  it('should return escalation tickets as alerts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reputation/alerts', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('should filter alerts by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reputation/alerts?status=open', headers });
    const body = expectSuccess(res);
    for (const alert of body.data) {
      expect(alert.status).toBe('open');
    }
  });

  it('should return alerts ordered by severity then date', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reputation/alerts', headers });
    const body = expectSuccess(res);
    // First alert should have highest severity ('critical' sorts before 'high')
    expect(body.data[0].severity).toBe('critical');
  });
});
