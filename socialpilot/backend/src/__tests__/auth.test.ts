/**
 * Auth module integration tests.
 *
 * Tests:
 * - POST /api/auth/register — creates a new user
 * - POST /api/auth/login — authenticates a user
 * - GET /api/auth/me — returns authenticated user profile
 * - POST /api/auth/google — Google OAuth flow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, expectSuccess, expectError } from './helpers';
import { cleanDatabase } from './setup';
import authRoutes from '../modules/auth/routes';

let app: FastifyInstance;
let testUser: any;

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Auth Module — POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'register-test@test.ai',
        password: 'password1234',
        name: 'Register Test',
      },
    });
    const body = expectSuccess(res);
    expect(body.data.user.email).toBe('register-test@test.ai');
    expect(body.data.user.name).toBe('Register Test');
    expect(body.data.token).toBeDefined();
    expect(typeof body.data.token).toBe('string');
  });

  it('should reject duplicate email registration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'register-test@test.ai',
        password: 'password1234',
        name: 'Duplicate Test',
      },
    });
    expectError(res, 409);
  });

  it('should reject invalid email format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'not-an-email',
        password: 'password1234',
        name: 'Bad Email',
      },
    });
    expectError(res, 400);
  });

  it('should reject short password (< 8 chars)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'short-pw@test.ai',
        password: 'short',
        name: 'Short PW',
      },
    });
    expectError(res, 400);
  });

  it('should reject missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'no-name@test.ai',
        password: 'password1234',
        name: '',
      },
    });
    expectError(res, 400);
  });
});

describe('Auth Module — POST /api/auth/login', () => {
  beforeAll(async () => {
    // Ensure test user exists
    testUser = await createTestUser({
      email: 'login-test@test.ai',
      password: 'login-pw-1234',
    });
  });

  it('should login with valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'login-test@test.ai',
        password: 'login-pw-1234',
      },
    });
    const body = expectSuccess(res);
    expect(body.data.user.email).toBe('login-test@test.ai');
    expect(body.data.token).toBeDefined();
  });

  it('should reject invalid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'login-test@test.ai',
        password: 'wrong-password',
      },
    });
    expectError(res, 401);
  });

  it('should reject non-existent email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'nonexistent@test.ai',
        password: 'some-password',
      },
    });
    expectError(res, 401);
  });
});

describe('Auth Module — GET /api/auth/me', () => {
  let authUser: any;

  beforeAll(async () => {
    authUser = await createTestUser({
      email: 'me-test@test.ai',
      password: 'me-pw-1234',
    });
  });

  it('should return the authenticated user', async () => {
    const token = app.jwt.sign({ id: authUser.id, email: authUser.email });
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = expectSuccess(res);
    expect(body.data.email).toBe('me-test@test.ai');
    expect(body.data.id).toBe(authUser.id);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer invalid-token-here' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth Module — POST /api/auth/google', () => {
  it('should reject missing idToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: {},
    });
    expectError(res, 400);
  });

  it('should reject invalid Google token (no actual Google call made)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'fake-google-id-token' },
    });
    expectError(res, 401);
  });
});
