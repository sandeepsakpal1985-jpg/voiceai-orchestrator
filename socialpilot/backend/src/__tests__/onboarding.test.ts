/**
 * Onboarding module integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, authHeaders } from './helpers';
import { cleanDatabase } from './setup';
import onboardingRoutes from '../modules/onboarding/routes';

let app: FastifyInstance;
let user: any;
let headers: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
  await app.ready();
  user = await createTestUser({ email: 'onboarding-test@test.ai' });
  headers = authHeaders(app, user);
});

afterAll(async () => {
  await app.close();
});

describe('Onboarding Module', () => {
  it('GET / — should return onboarding status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/onboarding', headers });
    const body = expectSuccess(res);
    expect(body.data.onboardingStep).toBeDefined();
    expect(body.data.onboardingDone).toBeDefined();
  });

  it('PUT /step — should update onboarding step', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/onboarding/step',
      headers,
      payload: { step: 'connect_instagram' },
    });
    const body = expectSuccess(res);
    expect(body.data.step).toBe('connect_instagram');
    expect(body.data.done).toBe(false);
  });

  it('PUT /step — should complete onboarding on last step', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/onboarding/step',
      headers,
      payload: { step: 'turn_on_automation' },
    });
    const body = expectSuccess(res);
    expect(body.data.step).toBe('turn_on_automation');
    expect(body.data.done).toBe(true);
  });

  it('POST /complete — should finalize onboarding with personality and CTA', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding/complete',
      headers,
      payload: {
        personality: 'friendly',
        ctaType: 'website',
        ctaUrl: 'https://example.com',
        ctaLabel: 'Visit Us',
      },
    });
    const body = expectSuccess(res);
    expect(body.data.done).toBe(true);
  });
});
