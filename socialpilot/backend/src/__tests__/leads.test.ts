/**
 * Leads module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import leadRoutes from '../modules/leads/routes';
import crmRoutes from '../modules/crm/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(leadRoutes, { prefix: '/api/leads' });
  await app.register(crmRoutes, { prefix: '/api/crm' });
  await app.ready();
  user = await createTestUser({ email: 'leads-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Leads Module', () => {
  let leadId: string;

  it('should list leads (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBe(0);
  });

  it('should create test leads via Prisma', async () => {
    const prisma = getTestPrisma();
    const lead = await prisma.lead.create({
      data: {
        userId: user.id,
        name: 'John Doe',
        socialHandle: 'john_doe',
        platform: 'instagram',
        source: 'comment',
        category: 'warm',
        leadScore: 75,
        sentiment: 0.5,
        email: 'john@example.com',
        phone: '+1234567890',
      },
    });
    leadId = lead.id;
    expect(leadId).toBeDefined();

    // Create more leads for pagination tests
    await prisma.lead.createMany({
      data: [
        { userId: user.id, name: 'Jane Smith', socialHandle: 'jane_smith', platform: 'facebook', source: 'dm', category: 'hot', leadScore: 90, sentiment: 0.8 },
        { userId: user.id, name: 'Bob Wilson', socialHandle: 'bob_w', platform: 'instagram', source: 'manual', category: 'cold', leadScore: 20, sentiment: -0.2 },
      ],
    });
  });

  it('should list leads with data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(3);
    expect(body.total).toBe(3);
  });

  it('should support pagination', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads?limit=2', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(2);
    expect(body.totalPages).toBe(2);
  });

  it('should filter by category', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads?category=hot', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].category).toBe('hot');
  });

  it('should search leads by name', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads?search=John', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('John Doe');
  });

  it('should get a specific lead', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/leads/${leadId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.id).toBe(leadId);
    expect(body.data.name).toBe('John Doe');
  });

  it('should return 404 for non-existent lead', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads/bad-id', headers });
    expectError(res, 404);
  });

  it('should update a lead', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/leads/${leadId}`,
      headers,
      payload: { name: 'John Updated', category: 'hot' },
    });
    const body = expectSuccess(res);
    expect(body.data.name).toBe('John Updated');
    expect(body.data.category).toBe('hot');
  });

  it('should convert lead to CRM deal', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/leads/${leadId}/convert`,
      headers,
      payload: { title: 'Test Deal from Lead', value: 5000 },
    });
    const body = expectSuccess(res);
    expect(body.data.title).toBe('Test Deal from Lead');
    expect(body.data.value).toBe(5000);
    expect(body.data.stage).toBe('new_lead');
  });

  it('should reject converting lead that already has a deal', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/leads/${leadId}/convert`,
      headers,
      payload: { title: 'Duplicate Deal' },
    });
    expectError(res, 409);
  });

  it('should export all leads', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads/export', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
  });
});
