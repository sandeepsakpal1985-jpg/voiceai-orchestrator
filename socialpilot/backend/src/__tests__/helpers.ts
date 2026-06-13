/**
 * Test helper utilities for MetaPilot backend integration tests.
 *
 * Provides:
 * - buildTestApp(): Creates a Fastify instance for testing
 * - createTestUser(): Creates a test user in the database
 * - getAuthToken(): Gets JWT token for a test user
 * - Admin role test user creation
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import prismaPlugin from '../plugins/prisma';
import authPlugin from '../plugins/auth';
import { config } from '../config';
import { getTestPrisma } from './setup';
import bcrypt from 'bcryptjs';
import { expect } from 'vitest';

// ── Test App Builder ──

/**
 * Build a minimal Fastify instance for testing.
 * Registers only essential plugins (cors, jwt, prisma, auth) without swagger.
 * Module routes are registered by individual test files as needed.
 */
export async function buildTestApp(withPlugins: boolean = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  if (withPlugins) {
    await app.register(cors, { origin: ['http://localhost:3000'], credentials: true });
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
    await app.register(jwt, { secret: config.jwt.secret });
    await app.register(prismaPlugin);
    await app.register(authPlugin);
  }

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
}

// ── Test User Factory ──

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  password: string;
}

/**
 * Create a subscription for a test user with the given plan.
 */
export async function createTestSubscription(prisma: any, userId: string, plan: string = 'free') {
  const plans: Record<string, any> = {
    free: { maxConnections: 1, maxLeads: 50, maxCrmDeals: 25, maxTeamMembers: 1, aiResponseLimit: 100 },
    starter: { maxConnections: 1, maxLeads: 100, maxCrmDeals: 50, maxTeamMembers: 1, aiResponseLimit: 1000 },
    professional: { maxConnections: 5, maxLeads: 999999, maxCrmDeals: 999999, maxTeamMembers: 5, aiResponseLimit: 3000 },
  };
  const p = plans[plan] || plans.free;
  return prisma.subscription.create({
    data: {
      userId,
      plan,
      status: 'active',
      features: [],
      ...p,
      currentPeriodStart: new Date(),
    },
  });
}

/**
 * Create a test user in the database.
 * Cleans up any existing user with the same email first.
 * Also creates a free subscription for the user.
 */
export async function createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  const prisma = getTestPrisma();
  const defaults = {
    email: 'test-user@socialpilot-test.ai',
    name: 'Test User',
    role: 'user',
    password: 'test-password-1234',
  };

  const opts = { ...defaults, ...overrides };

  // Clean up existing user with this email
  await prisma.user.deleteMany({ where: { email: opts.email } });

  const passwordHash = await bcrypt.hash(opts.password, 4); // low rounds for speed

  const user = await prisma.user.create({
    data: {
      email: opts.email,
      name: opts.name,
      role: opts.role,
      passwordHash,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  // Create a free subscription for the test user so usage routes work
  await createTestSubscription(prisma, user.id, 'free');

  return { ...user, name: user.name || '', password: opts.password };
}

/**
 * Create a test admin user.
 */
export async function createTestAdmin(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  return createTestUser({
    email: 'test-admin@socialpilot-test.ai',
    name: 'Test Admin',
    role: 'admin',
    ...overrides,
  });
}

/**
 * Create an owner user.
 */
export async function createTestOwner(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  return createTestUser({
    email: 'test-owner@socialpilot-test.ai',
    name: 'Test Owner',
    role: 'owner',
    ...overrides,
  });
}

// ── Auth Token Helpers ──

/**
 * Get a JWT token for the given test user.
 * Requires a Fastify instance with the JWT plugin registered.
 */
export function getAuthToken(app: FastifyInstance, user: TestUser): string {
  return app.jwt.sign({ id: user.id, email: user.email });
}

/**
 * Get auth headers for a test user.
 */
export function authHeaders(app: FastifyInstance, user: TestUser): { authorization: string } {
  const token = getAuthToken(app, user);
  return { authorization: `Bearer ${token}` };
}

// ── Assertion Helpers ──

/**
 * Assert a successful API response with a 2xx status code.
 */
export function expectSuccess(response: { statusCode: number; body: string }): any {
  expect(response.statusCode).toBeGreaterThanOrEqual(200);
  expect(response.statusCode).toBeLessThan(300);
  const body = JSON.parse(response.body);
  expect(body.success).toBe(true);
  return body;
}

/**
 * Assert an error API response with a specific status code.
 */
export function expectError(response: { statusCode: number; body: string }, statusCode: number): any {
  expect(response.statusCode).toBe(statusCode);
  const body = JSON.parse(response.body);
  expect(body.success).toBe(false);
  return body;
}
