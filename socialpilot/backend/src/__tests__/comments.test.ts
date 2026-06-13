/**
 * Comments module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import commentRoutes from '../modules/comments/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(commentRoutes, { prefix: '/api/comments' });
  await app.ready();
  user = await createTestUser({ email: 'comments-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Comments Module', () => {
  let commentId: string;

  it('should list comments (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/comments', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBe(0);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/comments' });
    expect(res.statusCode).toBe(401);
  });

  it('should create test comment via Prisma for further tests', async () => {
    const prisma = getTestPrisma();
    const comment = await prisma.socialComment.create({
      data: {
        userId: user.id,
        platform: 'instagram',
        postId: 'post_123',
        content: 'Great product! How do I buy?',
        authorId: 'test_user_123',
        authorName: 'Test User',
        replyStatus: 'pending',
      },
    });
    commentId = comment.id;
    expect(commentId).toBeDefined();
  });

  it('should list comments with data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/comments', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].content).toContain('Great product');
  });

  it('should get a specific comment', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/comments/${commentId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.id).toBe(commentId);
  });

  it('should return 404 for non-existent comment', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/comments/non-existent-id', headers });
    expectError(res, 404);
  });

  it('should approve a draft reply', async () => {
    // Set up a draft reply first
    const prisma = getTestPrisma();
    await prisma.socialComment.update({
      where: { id: commentId },
      data: { replyContent: 'Thanks for your interest! Check our website.', replyStatus: 'pending' },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/comments/${commentId}/review`,
      headers,
      payload: { action: 'approve' },
    });
    const body = expectSuccess(res);
    expect(body.data.approved).toBe(true);
  });

  it('should reject a draft reply', async () => {
    const prisma = getTestPrisma();
    // Create another comment for rejection test
    const comment = await prisma.socialComment.create({
      data: {
        userId: user.id, platform: 'facebook', postId: 'post_456',
        content: 'Need help with setup', authorName: 'User 2',
        authorId: 'user_2_456', replyStatus: 'pending', replyContent: 'Sure!',
      },
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/comments/${comment.id}/review`,
      headers,
      payload: { action: 'reject' },
    });
    const body = expectSuccess(res);
    expect(body.data.approved).toBe(false);
  });

  it('should post a manual reply', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/comments/${commentId}/reply`,
      headers,
      payload: { content: 'Manual reply here!' },
    });
    const body = expectSuccess(res);
    expect(body.data.replied).toBe(true);
  });
});
