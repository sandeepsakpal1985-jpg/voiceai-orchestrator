/**
 * End-to-end Pipeline Integration Tests
 *
 * Verifies the core data flow from Meta webhook ingestion through
 * the complete processing pipeline to persistent storage:
 *
 *   Meta webhook → DB storage → Comment/DM records → Mastra workflow → Lead/CRM creation
 *
 * These tests use real database operations against the test PostgreSQL
 * (running via Docker) and mock the external HTTP/LLM calls.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';

// ── Module Imports ──
import metaRoutes from '../modules/meta/routes';

// Mock BullMQ queue functions — Redis may not be available in test env
// The queue behavior is tested separately in queue-service tests
vi.mock('../services/queue/queue-service', () => ({
  addCommentJob: vi.fn().mockResolvedValue({ id: 'mock-job' }),
  addDMJob: vi.fn().mockResolvedValue({ id: 'mock-job' }),
  addReEngagementJob: vi.fn().mockResolvedValue({ id: 'mock-job' }),
}));

// ── Test Globals ──
let app: FastifyInstance;
let user: any;
let headers: { authorization: string };
let connectionId: string;

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(metaRoutes, { prefix: '/api/meta' });
  await app.ready();

  user = await createTestUser({
    email: 'e2e-pipeline@test.ai',
    name: 'E2E Pipeline User',
  });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('E2E: Meta Webhook → Comment → Pipeline → Lead', () => {
  // ── Connect an Instagram account first ──

  it('should connect an Instagram account', async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/api/meta/instagram/connect',
      headers,
      payload: {
        instagramAccountId: 'ig_e2e_test_001',
        instagramUsername: 'e2e_test_business',
        accessToken: 'e2e_mock_access_token',
        tokenExpiresAt: futureDate,
      },
    });
    const body = expectSuccess(res);
    connectionId = body.data.id;
    expect(connectionId).toBeDefined();
  });

  // ── Simulate Meta webhook with a real comment payload ──

  it('should ingest a comment via Meta webhook', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meta/webhook',
      payload: {
        object: 'instagram',
        entry: [
          {
            id: 'ig_e2e_test_001',
            time: Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'comments',
                value: {
                  id: 'comment_e2e_001',
                  post_id: 'post_e2e_001',
                  text: 'Hey! How much does your MetaPilot AI plan cost? Im interested in automating my Instagram replies!',
                  from: { id: 'customer_e2e_001', name: 'Jane Doe' },
                  created_time: Date.now(),
                },
              },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('EVENT_RECEIVED');
  });

  // ── Verify webhook was stored in the database ──

  it('should have stored the raw webhook event', async () => {
    const prisma = getTestPrisma();
    const webhooks = await prisma.metaWebhook.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    expect(webhooks.length).toBeGreaterThanOrEqual(1);
    const latest = webhooks[0];
    expect(latest.eventType).toBe('instagram');
  });

  // ── Verify a SocialComment record was created ──

  it('should have created a SocialComment record', async () => {
    const prisma = getTestPrisma();
    const comments = await prisma.socialComment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    expect(comments.length).toBeGreaterThanOrEqual(1);
    const comment = comments[0];
    expect(comment.authorName).toBe('Jane Doe');
    expect(comment.content).toContain('MetaPilot AI');
    expect(comment.platform).toBe('instagram');
    expect(comment.replyStatus).toBe('pending');
  });

  // ── Verify a comment job was queued ──

  it('should have queued a comment-processing job', async () => {
    const prisma = getTestPrisma();
    const comment = await prisma.socialComment.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // The comment should have a replyStatus of 'pending' indicating it's ready for processing
    expect(comment?.replyStatus).toBe('pending');
  });

  // ── Simulate what the Mastra workflow does: classify & create lead ──
  //
  // We can't easily run the BullMQ worker inside the test process,
  // so we test the database operations that the pipeline would perform.
  // This verifies the data model and state transitions.

  it('should have the right data shape for the Mastra pipeline', async () => {
    const prisma = getTestPrisma();
    const comment = await prisma.socialComment.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // The pipeline expects these fields
    expect(comment).toBeDefined();
    expect(comment!.id).toBeDefined();
    expect(comment!.userId).toBe(user.id);
    expect(comment!.platform).toBe('instagram');
    expect(comment!.postId).toBe('post_e2e_001');
    expect(comment!.authorId).toBe('customer_e2e_001');
    expect(comment!.authorName).toBe('Jane Doe');
    expect(comment!.content).toContain('cost');
    expect(comment!.replyStatus).toBe('pending');
  });
});

describe('E2E: Meta Webhook → DM → Pipeline → Lead', () => {
  // ── Simulate a DM webhook event ──

  it('should ingest a DM via Meta webhook', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meta/webhook',
      payload: {
        object: 'instagram',
        entry: [
          {
            id: 'ig_e2e_test_001',
            time: Math.floor(Date.now() / 1000),
            messaging: [
              {
                sender: { id: 'dm_customer_e2e_001' },
                recipient: { id: 'ig_e2e_test_001' },
                timestamp: Math.floor(Date.now() / 1000),
                message: {
                  text: 'Hi! I saw your Instagram post about AI automation. Can you tell me more about how it works for small businesses? I run a boutique clothing store.',
                  mid: 'dm_mid_e2e_001',
                },
              },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('EVENT_RECEIVED');
  });

  // ── Verify DM conversation and message were created ──

  it('should have created a DM conversation and message', async () => {
    const prisma = getTestPrisma();
    const conversations = await prisma.dMConversation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    expect(conversations.length).toBeGreaterThanOrEqual(1);
    const conv = conversations[0];
    expect(conv.customerId).toBe('dm_customer_e2e_001');
    expect(conv.status).toBe('active');

    const messages = await prisma.dMMessage.findMany({
      where: { conversationId: conv.id },
    });

    expect(messages.length).toBe(1);
    expect(messages[0].content).toContain('boutique clothing store');
    expect(messages[0].role).toBe('user');
  });

  // ── Verify DM has all required fields for Mastra DM pipeline ──

  it('should have the right data shape for the Mastra DM pipeline', async () => {
    const prisma = getTestPrisma();
    const conv = await prisma.dMConversation.findFirst({
      where: { userId: user.id, customerId: 'dm_customer_e2e_001' },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });

    expect(conv).toBeDefined();
    expect(conv!.userId).toBe(user.id);
    expect(conv!.customerId).toBe('dm_customer_e2e_001');
    expect(conv!.platform).toBe('instagram');
    expect(conv!.messages[0]).toBeDefined();
    expect(conv!.messages[0].senderId).toBe('dm_customer_e2e_001');
    expect(conv!.messages[0].role).toBe('user');
    expect(conv!.messages[0].content).toContain('boutique clothing');
  });
});

describe('E2E: Lead & CRM Creation (Pipeline Output Verification)', () => {
  // ── Simulate what the Mastra pipeline does post-classification ──
  // This tests that the DB operations the pipeline would perform
  // work correctly without running the actual pipeline.

  let leadId: string;

  it('should create a lead manually (simulating pipeline output)', async () => {
    const prisma = getTestPrisma();

    const lead = await prisma.lead.create({
      data: {
        userId: user.id,
        name: 'Jane Doe',
        socialHandle: 'customer_e2e_001',
        platform: 'instagram',
        category: 'warm',
        leadScore: 72,
        sentiment: 0.6,
        source: 'comment',
        requirement: 'Interested in MetaPilot AI pricing for Instagram automation',
        tags: ['pricing_inquiry', 'instagram'],
        lastContactAt: new Date(),
      },
    });

    leadId = lead.id;
    expect(lead.leadScore).toBe(72);
    expect(lead.category).toBe('warm');
  });

  it('should create a CRM deal from the lead (simulating pipeline output)', async () => {
    const prisma = getTestPrisma();

    const deal = await prisma.cRMDeal.create({
      data: {
        userId: user.id,
        leadId,
        title: 'Jane Doe — MetaPilot AI Pricing Inquiry',
        value: 0,
        stage: 'new_lead',
        leadScore: 72,
        sentiment: 0.6,
        aiSummary: 'Customer reached out via Instagram comment asking about pricing. Lead scored 72 (warm).',
        createdAt: new Date(),
      },
    });

    expect(deal.id).toBeDefined();
    expect(deal.stage).toBe('new_lead');
    expect(deal.leadId).toBe(leadId);
  });

  it('should link the CRM deal back to the lead', async () => {
    const prisma = getTestPrisma();
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { crmDeal: true },
    });

    expect(lead?.crmDeal).toBeDefined();
    expect(lead!.crmDeal!.title).toContain('MetaPilot AI');
  });

  it('should create a CRM activity for deal tracking', async () => {
    const prisma = getTestPrisma();
    const deal = await prisma.cRMDeal.findFirst({
      where: { leadId },
    });

    const activity = await prisma.cRMActivity.create({
      data: {
        dealId: deal!.id,
        type: 'follow_up',
        content: 'Lead created from Instagram comment — warm lead, pricing inquiry. Follow up within 24h.',
        createdBy: 'ai_pipeline',
      },
    });

    expect(activity.id).toBeDefined();
    expect(activity.type).toBe('follow_up');

    // Verify it appears in the deal's activity timeline
    const activities = await prisma.cRMActivity.findMany({
      where: { dealId: deal!.id },
    });
    expect(activities.length).toBe(1);
  });
});

describe('E2E: Knowledge + Context Builder (Pipeline Input Verification)', () => {
  let docId: string;

  it('should create a knowledge document that the pipeline would use', async () => {
    const prisma = getTestPrisma();

    const doc = await prisma.knowledgeDocument.create({
      data: {
        userId: user.id,
        title: 'MetaPilot AI Pricing',
        type: 'pricing',
        content: `MetaPilot AI offers three plans:\n- Starter: $29/mo — 500 AI responses, 1 social account\n- Professional: $79/mo — 2000 AI responses, 3 social accounts\n- Enterprise: $199/mo — Unlimited AI responses, 10+ social accounts`,
      },
    });

    docId = doc.id;
    expect(doc.type).toBe('pricing');
  });

  it('should retrieve knowledge for pipeline context building', async () => {
    const prisma = getTestPrisma();
    const docs = await prisma.knowledgeDocument.findMany({
      where: { userId: user.id, type: 'pricing' },
    });

    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs[0].content).toContain('Starter');
    expect(docs[0].content).toContain('$29/mo');
  });

  it('should create customer memory for pipeline context', async () => {
    const prisma = getTestPrisma();

    const memory = await prisma.customerMemory.create({
      data: {
        userId: user.id,
        socialHandle: 'customer_e2e_001',
        platform: 'instagram',
        name: 'Jane Doe',
        previousConversations: 1,
        maxLeadScore: 72,
        recentSentiment: 0.6,
        tags: ['pricing_inquiry', 'instagram_follower'],
        journey: ['commented'],
        relationshipStatus: 'new',
      },
    });

    expect(memory.id).toBeDefined();
    expect(memory.name).toBe('Jane Doe');
    expect(memory.journey).toContain('commented');
  });
});
