/**
 * Admin module integration tests.
 *
 * Tests admin-only endpoints: stats, audit-log, users management.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, createTestUser, createTestAdmin, createTestOwner, expectSuccess, expectError, authHeaders } from './helpers';
import { cleanDatabase, getTestPrisma } from './setup';
import adminRoutes from '../modules/admin/routes';

let app: FastifyInstance;
let regularUser: any;
let adminUser: any;
let ownerUser: any;
let userHeaders: { authorization: string };
let adminHeaders: { authorization: string };
let ownerHeaders: { authorization: string };

beforeAll(async () => {
  await cleanDatabase();
  app = await buildTestApp();
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.ready();
  
  regularUser = await createTestUser({ email: 'regular@test.ai', name: 'Regular User' });
  adminUser = await createTestAdmin({ email: 'admin@test.ai', name: 'Admin User' });
  ownerUser = await createTestOwner({ email: 'owner@test.ai', name: 'Owner User' });
  
  userHeaders = authHeaders(app, regularUser);
  adminHeaders = authHeaders(app, adminUser);
  ownerHeaders = authHeaders(app, ownerUser);
});

afterAll(async () => {
  await app.close();
});

describe('Admin Module — Access Control', () => {
  it('should reject regular user from accessing admin stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/stats', headers: userHeaders });
    expectError(res, 403);
  });

  it('should allow admin user to access admin stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/stats', headers: adminHeaders });
    const body = expectSuccess(res);
    expect(body.data.users).toBeDefined();
    expect(body.data.leads).toBeDefined();
  });

  it('should allow owner user to access admin stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/stats', headers: ownerHeaders });
    const body = expectSuccess(res);
    expect(body.data.users.total).toBe(3); // 3 users created
  });

  it('should reject regular user from audit log', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit-log', headers: userHeaders });
    expectError(res, 403);
  });

  it('should allow admin to view audit log', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit-log', headers: adminHeaders });
    const body = expectSuccess(res);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('should reject regular user from viewing users list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: userHeaders });
    expectError(res, 403);
  });

  it('should allow admin to list users', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: adminHeaders });
    const body = expectSuccess(res);
    expect(body.data.length).toBe(3); // regular + admin + owner
  });
});

describe('Admin Module — Audit Log', () => {
  let auditEntryId: string;

  it('should create an audit log entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/audit-log',
      headers: adminHeaders,
      payload: {
        action: 'user.login',
        resourceType: 'user',
        resourceId: adminUser.id,
        details: { ip: '127.0.0.1' },
      },
    });
    const body = expectSuccess(res);
    auditEntryId = body.data.id;
    expect(body.data.action).toBe('user.login');
  });

  it('should list audit log entries', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit-log', headers: adminHeaders });
    const body = expectSuccess(res);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter audit log by action', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit-log?action=user.login', headers: adminHeaders });
    const body = expectSuccess(res);
    expect(body.data.every((e: any) => e.action === 'user.login')).toBe(true);
  });

  it('should return audit log with user details', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit-log', headers: adminHeaders });
    const body = expectSuccess(res);
    expect(body.data[0].user).toBeDefined();
    expect(body.data[0].user.name).toBe('Admin User');
  });
});
