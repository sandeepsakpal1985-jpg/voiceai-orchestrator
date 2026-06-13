/**
 * Knowledge module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase } from './setup';
import knowledgeRoutes from '../modules/knowledge/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };
let docId: string;

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(knowledgeRoutes, { prefix: '/api/knowledge' });
  await app.ready();
  user = await createTestUser({ email: 'knowledge-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Knowledge Module', () => {
  it('should list documents (empty)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/knowledge', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('should create a document', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/knowledge',
      headers,
      payload: {
        title: 'Shipping Policy',
        type: 'policy',
        content: 'We ship within 3-5 business days via USPS.',
      },
    });
    const body = expectSuccess(res);
    docId = body.data.id;
    expect(body.data.title).toBe('Shipping Policy');
    expect(body.data.type).toBe('policy');
  });

  it('should list documents with data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/knowledge', headers });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].title).toBe('Shipping Policy');
  });

  it('should get a specific document', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/knowledge/${docId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.id).toBe(docId);
    expect(body.data.content).toContain('3-5 business days');
  });

  it('should return 404 for non-existent document', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/knowledge/bad-id', headers });
    expectError(res, 404);
  });

  it('should update a document', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/knowledge/${docId}`,
      headers,
      payload: { title: 'Shipping Policy v2', content: 'We ship within 1-2 business days.' },
    });
    const body = expectSuccess(res);
    expect(body.data.title).toBe('Shipping Policy v2');
  });

  it('should delete a document', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/knowledge/${docId}`, headers });
    const body = expectSuccess(res);
    expect(body.data.deleted).toBe(true);
  });

  it('should return 404 after deletion', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/knowledge/${docId}`, headers });
    expectError(res, 404);
  });

  it('POST /upload should return 400 when no file is uploaded', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/knowledge/upload', headers });
    // Without multipart data, @fastify/multipart returns 400
    expect(res.statusCode).toBe(400);
  });
});
