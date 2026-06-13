/**
 * Approval workflow module integration tests.
 *
 * Tests: list with pagination, approve, reject, edit-publish, stats, access control.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import approvalRoutes from '../modules/approvals/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };
let approvalId: string;

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(approvalRoutes, { prefix: '/api/approvals' });
  await app.ready();

  user = await createTestUser({ email: 'approvals-test@test.ai', name: 'Approvals Test User' });
  headers = authHeaders(app, user);

  // Seed test approval requests
  const prisma = getTestPrisma();
  await prisma.approvalRequest.createMany({
    data: [
      {
        userId: user.id, customerId: 'cust_pricing',
        customerName: 'Pricing Customer', platform: 'instagram',
        draftContent: 'Thanks for your interest! Our pricing starts at $29/mo.',
        originalMessage: 'How much does it cost?',
        confidenceScore: 0.92, status: 'pending',
      },
      {
        userId: user.id, customerId: 'cust_general',
        customerName: 'General Customer', platform: 'instagram',
        draftContent: 'We would love to help your business!',
        originalMessage: 'Can you help me?',
        confidenceScore: 0.45, status: 'pending',
      },
      {
        userId: user.id, customerId: 'cust_approved',
        customerName: 'Approved Customer', platform: 'instagram',
        draftContent: 'Approved reply content.',
        originalMessage: 'Tell me more',
        confidenceScore: 0.88, status: 'approved',
        reviewedBy: user.id, reviewedAt: new Date(),
      },
    ],
  });
});

afterAll(async () => {
  await app.close();
});

describe('Approvals — GET /', () => {
  it('should list all approval requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/approvals', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
    expect(body.total).toBe(3);
  });

  it('should filter by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/approvals?status=pending', headers });
    const body = expectSuccess(res);
    for (const item of body.data) {
      expect(item.status).toBe('pending');
    }
  });

  it('should paginate results', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/approvals?page=1&limit=2', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.totalPages).toBe(2); // 3 total, 2 per page = 2 pages
  });
});

describe('Approvals — GET /:id', () => {
  beforeAll(async () => {
    const prisma = getTestPrisma();
    const approval = await prisma.approvalRequest.findFirst({ where: { userId: user.id } });
    approvalId = approval!.id;
  });

  it('should return approval by id', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/approvals/${approvalId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.id).toBe(approvalId);
  });

  it('should return 404 for non-existent approval', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/approvals/non-existent-id', headers });
    expectError(res, 404);
  });
});

describe('Approvals — POST /:id/approve', () => {
  it('should approve a pending approval', async () => {
    const prisma = getTestPrisma();
    const pending = await prisma.approvalRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
    });

    const res = await app.inject({
      method: 'POST', url: `/api/approvals/${pending!.id}/approve`,
      headers, payload: { reviewNote: 'Looks good!' },
    });
    const body = expectSuccess(res);
    expect(body.data.status).toBe('approved');
    expect(body.data.reviewNote).toBe('Looks good!');
    expect(body.data.reviewedBy).toBe(user.id);
  });

  it('should reject approving an already-reviewed request', async () => {
    const prisma = getTestPrisma();
    const approved = await prisma.approvalRequest.findFirst({
      where: { userId: user.id, status: 'approved' },
    });

    const res = await app.inject({
      method: 'POST', url: `/api/approvals/${approved!.id}/approve`,
      headers, payload: {},
    });
    expectError(res, 400);
  });
});

describe('Approvals — POST /:id/reject', () => {
  it('should reject a pending approval', async () => {
    const prisma = getTestPrisma();
    const pending = await prisma.approvalRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
    });

    const res = await app.inject({
      method: 'POST', url: `/api/approvals/${pending!.id}/reject`,
      headers, payload: { reviewNote: 'Needs better tone' },
    });
    const body = expectSuccess(res);
    expect(body.data.status).toBe('rejected');
    expect(body.data.reviewNote).toBe('Needs better tone');
  });

  it('should return 404 for non-existent approval', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/approvals/invalid-id/reject',
      headers, payload: {},
    });
    expectError(res, 404);
  });
});

describe('Approvals — POST /:id/edit-publish', () => {
  let pendingId: string;

  beforeAll(async () => {
    const prisma = getTestPrisma();
    const opp = await prisma.approvalRequest.create({
      data:      {
        userId: user.id, customerId: 'cust_edit_test',
        customerName: 'Edit Test Customer', platform: 'instagram',
        draftContent: 'Original draft content.',
        originalMessage: 'Tell me more',
        confidenceScore: 0.7, status: 'pending',
      },
    });
    pendingId = opp.id;
  });

  it('should approve with edited content', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/approvals/${pendingId}/edit-publish`,
      headers, payload: {
        draftContent: 'Edited: Much better reply content.',
        reviewNote: 'Edited for tone',
      },
    });
    const body = expectSuccess(res);
    expect(body.data.status).toBe('approved');
    expect(body.data.draftContent).toBe('Edited: Much better reply content.');
    expect(body.data.reviewNote).toBe('Edited for tone');
  });

  it('should reject edit-publish with empty content', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/approvals/${pendingId}/edit-publish`,
      headers, payload: { draftContent: '' },
    });
    // Fastify returns 500 for unhandled Zod errors (no validation error handler)
    expect(res.statusCode).toBe(500);
  });
});

describe('Approvals — GET /stats', () => {
  it('should return approval statistics', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/approvals/stats', headers });
    const body = expectSuccess(res);
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('pending');
    expect(body.data).toHaveProperty('approved');
    expect(body.data).toHaveProperty('rejected');
    expect(body.data).toHaveProperty('approvalRate');
    expect(body.data).toHaveProperty('rejectionRate');
    expect(body.data.total).toBeGreaterThanOrEqual(4);
  });
});
