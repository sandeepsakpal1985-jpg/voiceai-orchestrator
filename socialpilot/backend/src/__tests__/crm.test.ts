/**
 * CRM module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import crmRoutes from '../modules/crm/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(crmRoutes, { prefix: '/api/crm' });
  await app.ready();
  user = await createTestUser({ email: 'crm-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('CRM Module', () => {
  let dealId: string;
  let leadId: string;

  beforeAll(async () => {
    const prisma = getTestPrisma();
    // Create a lead for the CRM deal
    const lead = await prisma.lead.create({
      data: {
        userId: user.id, name: 'CRM Lead', socialHandle: 'crm_lead',
        platform: 'instagram', source: 'dm', category: 'hot', leadScore: 85,
      },
    });
    leadId = lead.id;
  });

  it('should list CRM deals grouped by stage (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crm', headers });
    const body = expectSuccess(res);
    expect(body.data).toBeDefined();
    expect(body.data.new_lead).toEqual([]);
    expect(body.data.contacted).toEqual([]);
    expect(body.data.won).toEqual([]);
  });

  it('should create a deal via Prisma for testing', async () => {
    const prisma = getTestPrisma();
    const deal = await prisma.cRMDeal.create({
      data: {
        userId: user.id, leadId, title: 'Test Deal',
        value: 10000, stage: 'new_lead', leadScore: 85,
      },
    });
    dealId = deal.id;
    expect(dealId).toBeDefined();
  });

  it('should return deals grouped by stage (Kanban)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crm', headers });
    const body = expectSuccess(res);
    expect(body.data.new_lead.length).toBe(1);
    expect(body.data.new_lead[0].title).toBe('Test Deal');
  });

  it('should get a specific deal with activities', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/crm/${dealId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.id).toBe(dealId);
    expect(body.data.lead).toBeDefined();
    expect(Array.isArray(body.data.activities)).toBe(true);
  });

  it('should return 404 for non-existent deal', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/crm/bad-id', headers });
    expectError(res, 404);
  });

  it('should update deal stage', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/crm/${dealId}/stage`,
      headers,
      payload: { stage: 'qualified' },
    });
    const body = expectSuccess(res);
    expect(body.data.stage).toBe('qualified');
  });

  it('should add activity to a deal', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/crm/${dealId}/activities`,
      headers,
      payload: { type: 'call', content: 'Spoke with the lead, very interested' },
    });
    const body = expectSuccess(res);
    expect(body.data.type).toBe('call');
    expect(body.data.content).toContain('interested');
  });

  it('should update deal details', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/crm/${dealId}`,
      headers,
      payload: { title: 'Updated Deal Title', value: 15000 },
    });
    const body = expectSuccess(res);
    expect(body.data.title).toBe('Updated Deal Title');
    expect(body.data.value).toBe(15000);
  });

  it('should move deal through stages', async () => {
    for (const stage of ['contacted', 'qualified', 'demo_scheduled', 'proposal_sent', 'negotiation', 'won']) {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/crm/${dealId}/stage`,
        headers,
        payload: { stage },
      });
      const body = expectSuccess(res);
      expect(body.data.stage).toBe(stage);
    }
  });
});
