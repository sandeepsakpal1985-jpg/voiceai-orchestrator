/**
 * Escalation module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase } from './setup';
import escalationRoutes from '../modules/escalation/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };
let ticketId: string;

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(escalationRoutes, { prefix: '/api/escalations' });
  await app.ready();
  user = await createTestUser({ email: 'escalation-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Escalation Module', () => {
  it('should list tickets (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/escalations', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('should create a ticket via Prisma for further tests', async () => {
    const { getTestPrisma } = await import('./setup');
    const prisma = getTestPrisma();
    const ticket = await prisma.escalationTicket.create({
      data: {
        userId: user.id,
        customerId: 'angry_customer_123',
        reason: 'Customer complaint about product quality',
        severity: 'high',
        status: 'open',
      },
    });
    ticketId = ticket.id;
    expect(ticketId).toBeDefined();
  });

  it('should list tickets with data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/escalations', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].severity).toBe('high');
  });

  it('should get a specific ticket', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/escalations/${ticketId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.id).toBe(ticketId);
    expect(body.data.reason).toContain('product quality');
  });

  it('should return 404 for non-existent ticket', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/escalations/bad-id', headers });
    expectError(res, 404);
  });

  it('should update ticket status to in_progress', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/escalations/${ticketId}`,
      headers,
      payload: { status: 'in_progress', assignedTo: 'agent-1' },
    });
    const body = expectSuccess(res);
    expect(body.data.status).toBe('in_progress');
    expect(body.data.assignedTo).toBe('agent-1');
  });

  it('should resolve a ticket', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/escalations/${ticketId}`,
      headers,
      payload: { status: 'resolved', resolution: 'Apologized and offered refund' },
    });
    const body = expectSuccess(res);
    expect(body.data.status).toBe('resolved');
    expect(body.data.resolution).toBe('Apologized and offered refund');
    expect(body.data.resolvedAt).toBeDefined();
  });
});
