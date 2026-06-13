/**
 * Re-engagement module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import reengagementRoutes from '../modules/reengagement/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(reengagementRoutes, { prefix: '/api/reengagement' });
  await app.ready();
  user = await createTestUser({ email: 'reengage-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Re-engagement Module', () => {
  it('GET /rules — should return default rules', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reengagement/rules', headers });
    const body = expectSuccess(res);
    expect(body.data).toBeDefined();
    expect(body.data.userId).toBe(user.id);
    expect(Array.isArray(body.data.stages)).toBe(true);
    expect(body.data.stages.length).toBe(3);
    expect(body.data.stages[0].delay).toBe('24h');
  });

  it('PUT /rules — should update rules', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/reengagement/rules',
      headers,
      payload: {
        enabled: true,
        conditions: { minLeadScore: 50, onlyDormant: true },
      },
    });
    const body = expectSuccess(res);
    expect(body.data).toBeDefined();
  });

  it('GET /candidates — should list dormant leads', async () => {
    // Create a dormant lead
    const sevenDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await getTestPrisma().lead.create({
      data: {
        userId: user.id, name: 'Dormant Lead', socialHandle: 'dormant',
        platform: 'instagram', source: 'comment', category: 'warm',
        leadScore: 70, lastContactAt: sevenDaysAgo,
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/reengagement/candidates', headers });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});
