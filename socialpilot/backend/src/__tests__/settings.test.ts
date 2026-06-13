/**
 * Settings module integration tests.
 *
 * Tests brand settings CRUD: GET current settings, PUT update, auto-create.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, authHeaders } from './helpers';
import { cleanDatabase } from './setup';
import { settingsRoutes, brandRoutes } from '../modules/settings/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(brandRoutes, { prefix: '/api' });
  await app.ready();

  user = await createTestUser({ email: 'settings-test@test.ai', name: 'Settings User' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Settings Module — CRUD', () => {
  it('should auto-create settings on first GET', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers });
    const body = expectSuccess(res);
    expect(body.data.userId).toBe(user.id);
    expect(body.data.businessName).toBeDefined();
  });

  it('should update business name', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { businessName: 'Test Business Inc.' },
    });
    const body = expectSuccess(res);
    expect(body.data.businessName).toBe('Test Business Inc.');
  });

  it('should update multiple fields', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: {
        businessName: 'Updated Business',
        industry: 'Technology',
        automationEnabled: true,
        approvalModeType: 'hybrid',
      },
    });
    const body = expectSuccess(res);
    expect(body.data.businessName).toBe('Updated Business');
    expect(body.data.industry).toBe('Technology');
    expect(body.data.automationEnabled).toBe(true);
    expect(body.data.approvalModeType).toBe('hybrid');
  });

  it('should persist settings across GET calls', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers });
    const body = expectSuccess(res);
    expect(body.data.businessName).toBe('Updated Business');
    expect(body.data.industry).toBe('Technology');
  });

  it('should update tone instructions', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { toneInstructions: 'Professional and friendly' },
    });
    const body = expectSuccess(res);
    expect(body.data.toneInstructions).toBe('Professional and friendly');
  });

  it('should handle null fields', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { website: null, industry: null },
    });
    const body = expectSuccess(res);
    expect(body.data.website).toBeNull();
    expect(body.data.industry).toBeNull();
  });

  it('should reject unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Settings Module — Brand Endpoint', () => {
  it('should return null brand data for unknown domain', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/brand?domain=unknown.com' });
    const body = expectSuccess(res);
    expect(body.data).toBeNull();
  });

  it('should return brand data for configured domain', async () => {
    // First set a custom domain
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { customDomain: 'mybrand.com', businessName: 'Brand Co.' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/brand?domain=mybrand.com' });
    const body = expectSuccess(res);
    expect(body.data.businessName).toBe('Brand Co.');
  });
});
