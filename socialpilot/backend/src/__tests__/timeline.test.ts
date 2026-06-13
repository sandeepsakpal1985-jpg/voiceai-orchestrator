/**
 * Customer Journey Timeline module integration tests.
 *
 * Tests: lead timeline, customer handle timeline, event ordering,
 * event types coverage.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import timelineRoutes from '../modules/timeline/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };
let leadId: string;

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(timelineRoutes, { prefix: '/api/timeline' });
  await app.ready();

  user = await createTestUser({ email: 'timeline-test@test.ai', name: 'Timeline Test User' });
  headers = authHeaders(app, user);

  // Seed comprehensive customer data for timeline testing
  const prisma = getTestPrisma();

  // Create a lead
  const lead = await prisma.lead.create({
    data: {
      userId: user.id, name: 'Timeline Customer', socialHandle: 'timeline_user',
      platform: 'instagram', source: 'comment', category: 'warm',
      leadScore: 75, requirement: 'Interested in pricing',
      lastContactAt: new Date(),
    },
  });
  leadId = lead.id;

  // Create comments
  const comment1 = await prisma.socialComment.create({
    data: {
      userId: user.id, authorId: 'timeline_user', authorName: 'Timeline Customer',
      content: 'How much does it cost?', platform: 'instagram',
      postId: 'post_1', replyStatus: 'replied', category: 'sales_inquiry',
      replyContent: 'Our pricing starts at $29/mo!',
      repliedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });
  await prisma.socialComment.create({
    data: {
      userId: user.id, authorId: 'timeline_user', authorName: 'Timeline Customer',
      content: 'Sounds great!', platform: 'instagram',
      postId: 'post_1', replyStatus: 'pending',
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  // Create DM conversation with messages
  const conv = await prisma.dMConversation.create({
    data: {
      userId: user.id, customerId: 'timeline_user', platform: 'instagram',
      status: 'active', intent: 'pricing_inquiry',
      lastActivityAt: new Date(),
    },
  });
  await prisma.dMMessage.createMany({
    data: [
      { conversationId: conv.id, senderId: 'timeline_user', role: 'user', content: 'Can you tell me more?' },
      { conversationId: conv.id, senderId: user.id, role: 'agent', content: 'Sure! We offer 3 plans.' },
    ],
  });

  // Create CRM deal with activities
  const deal = await prisma.cRMDeal.create({
    data: {
      userId: user.id, leadId, title: 'Timeline Deal',
      stage: 'won', value: 5000, revenue: 5000, leadScore: 75,
    },
  });
  await prisma.cRMActivity.createMany({
    data: [
      { dealId: deal.id, type: 'follow_up', content: 'Sent pricing info', createdBy: 'ai' },
      { dealId: deal.id, type: 'demo', content: 'Scheduled demo call', createdBy: 'human' },
    ],
  });

  // Create customer memory
  await prisma.customerMemory.create({
    data: {
      userId: user.id, socialHandle: 'timeline_user', platform: 'instagram',
      name: 'Timeline Customer', previousConversations: 3,
      maxLeadScore: 75, recentSentiment: 0.6,
      tags: ['pricing'], journey: ['commented', 'dm', 'deal_won'],
      relationshipStatus: 'customer',
    },
  });
});

afterAll(async () => {
  await app.close();
});

describe('Timeline — GET /lead/:leadId', () => {
  it('should return lead timeline events', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('should include lead_created event', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'lead_created')).toBe(true);
  });

  it('should include comment events', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'comment')).toBe(true);
  });

  it('should include AI reply events', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'ai_reply')).toBe(true);
  });

  it('should include DM events', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'dm_started')).toBe(true);
  });

  it('should include deal events (created + won)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'deal_created')).toBe(true);
    expect(body.data.some((e: any) => e.type === 'deal_won')).toBe(true);
  });

  it('should include deal activities', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.filter((e: any) => e.type === 'deal_activity').length).toBe(2);
  });

  it('should include customer journey event if memory exists', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'journey')).toBe(true);
  });

  it('should return events sorted by timestamp ascending', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/timeline/lead/${leadId}`, headers });
    const body = expectSuccess(res);
    for (let i = 1; i < body.data.length; i++) {
      expect(new Date(body.data[i].timestamp).getTime())
        .toBeGreaterThanOrEqual(new Date(body.data[i - 1].timestamp).getTime());
    }
  });

  it('should return 404 for non-existent lead', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/timeline/lead/non-existent-id', headers });
    expectError(res, 404);
  });
});

describe('Timeline — GET /customer/:socialHandle', () => {
  it('should return customer timeline by handle', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/timeline/customer/timeline_user', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('should include comment events in customer timeline', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/timeline/customer/timeline_user', headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'comment')).toBe(true);
  });

  it('should include DM events in customer timeline', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/timeline/customer/timeline_user', headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'dm_started')).toBe(true);
  });

  it('should include lead + deal events in customer timeline', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/timeline/customer/timeline_user', headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'lead_created')).toBe(true);
    expect(body.data.some((e: any) => e.type === 'deal_created')).toBe(true);
  });

  it('should include customer profile / memory event', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/timeline/customer/timeline_user', headers });
    const body = expectSuccess(res);
    expect(body.data.some((e: any) => e.type === 'memory')).toBe(true);
  });

  it('should return events sorted by timestamp ascending', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/timeline/customer/timeline_user', headers });
    const body = expectSuccess(res);
    for (let i = 1; i < body.data.length; i++) {
      expect(new Date(body.data[i].timestamp).getTime())
        .toBeGreaterThanOrEqual(new Date(body.data[i - 1].timestamp).getTime());
    }
  });

  it('should return empty timeline for unknown handle', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/timeline/customer/unknown_user', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });
});
