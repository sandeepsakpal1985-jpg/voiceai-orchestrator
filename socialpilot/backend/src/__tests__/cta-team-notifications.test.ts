/**
 * CTA, Team, Notifications module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import ctaRoutes from '../modules/cta/routes';
import teamRoutes from '../modules/team/routes';
import notificationRoutes from '../modules/notifications/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(ctaRoutes, { prefix: '/api/cta' });
  await app.register(teamRoutes, { prefix: '/api/team' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.ready();
  user = await createTestUser({ email: 'cta-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('CTA Module', () => {
  let ctaId: string;

  it('should list CTAs (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cta', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('should create a CTA', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/cta', headers,
      payload: { type: 'website', label: 'Visit Website', url: 'https://example.com', isDefault: true },
    });
    const body = expectSuccess(res);
    ctaId = body.data.id;
    expect(body.data.type).toBe('website');
    expect(body.data.isDefault).toBe(true);
  });

  it('should list CTAs with data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/cta', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(1);
  });

  it('should update a CTA', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/cta/${ctaId}`, headers,
      payload: { label: 'Updated Label', minLeadScore: 50 },
    });
    const body = expectSuccess(res);
    expect(body.data.label).toBe('Updated Label');
    expect(body.data.minLeadScore).toBe(50);
  });

  it('should return 404 for non-existent CTA', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/cta/bad-id', headers, payload: {} });
    expectError(res, 404);
  });

  it('should delete a CTA', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/cta/${ctaId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.deleted).toBe(true);
  });
});

describe('Team Module', () => {
  let teamMemberId: string;

  it('should list team members (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/team', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should return 404 when inviting non-existent user', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/team/invite', headers,
      payload: { email: 'nonexistent@test.ai', role: 'sales_agent' },
    });
    expectError(res, 404);
  });

  it('should invite a team member', async () => {
    // Create another user to invite
    const prisma = getTestPrisma();
    const member = await prisma.user.create({
      data: { email: 'teammate@test.ai', name: 'Teammate', passwordHash: 'hash' },
    });

    const res = await app.inject({
      method: 'POST', url: '/api/team/invite', headers,
      payload: { email: 'teammate@test.ai', role: 'sales_agent' },
    });
    const body = expectSuccess(res);
    teamMemberId = body.data.id;
    expect(body.data.role).toBe('sales_agent');
  });

  it('should reject duplicate invite', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/team/invite', headers,
      payload: { email: 'teammate@test.ai', role: 'support_agent' },
    });
    expectError(res, 409);
  });

  it('should update member role', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/team/${teamMemberId}`, headers,
      payload: { role: 'admin' },
    });
    const body = expectSuccess(res);
    expect(body.data.role).toBe('admin');
  });

  it('should remove a team member', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/team/${teamMemberId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.deleted).toBe(true);
  });
});

describe('Notifications Module', () => {
  let notifId: string;

  it('should list notifications (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should get unread count (zero)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers });
    const body = expectSuccess(res);
    expect(body.data.count).toBe(0);
  });

  it('should create a notification', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/notifications', headers,
      payload: { type: 'lead', title: 'New Lead!', body: 'A new lead was captured from Instagram.' },
    });
    const body = expectSuccess(res);
    notifId = body.data.id;
    expect(body.data.title).toBe('New Lead!');
  });

  it('should list notifications with data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(1);
  });

  it('should get unread count', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers });
    const body = expectSuccess(res);
    expect(body.data.count).toBe(1);
  });

  it('should mark notification as read', async () => {
    const res = await app.inject({ method: 'PUT', url: `/api/notifications/${notifId}/read`, headers });
    const body = expectSuccess(res);
    expect(body.data.read).toBe(true);
  });

  it('should mark all as read', async () => {
    // Create another unread notification
    await app.inject({
      method: 'POST', url: '/api/notifications', headers,
      payload: { type: 'escalation', title: 'Escalation Alert', body: 'Urgent issue reported.' },
    });

    const res = await app.inject({ method: 'PUT', url: '/api/notifications/read-all', headers });
    const body = expectSuccess(res);
    expect(body.data.readAll).toBe(true);

    // Verify unread count is now zero
    const unreadRes = await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers });
    const unreadBody = JSON.parse(unreadRes.body);
    expect(unreadBody.data.count).toBe(0);
  });
});
