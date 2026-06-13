/**
 * Global test setup for MetaPilot backend integration tests.
 *
 * Sets environment variables pointing to Docker infrastructure:
 * - PostgreSQL on localhost:5432 (Docker)
 * - Redis on localhost:6380 (Docker, mapped from 6379)
 * - Qdrant on localhost:6333 (Docker)
 *
 * Also includes cleanup utilities used across test files.
 */

import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

// ── Set test environment variables BEFORE any imports ──
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Random available port
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/socialpilot';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.QDRANT_URL = 'http://localhost:6333';
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
process.env.JWT_EXPIRES_IN = '1h';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'test_verify_token';
process.env.META_CALLBACK_URL = 'http://localhost:4000/api/meta/callback';

// Prisma client for test DB operations
let _prisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

/**
 * Clean all test data from the database.
 * Runs before each test file to ensure isolation.
 */
export async function cleanDatabase(): Promise<void> {
  const prisma = getTestPrisma();
  // Delete in reverse dependency order
  await prisma.auditLogEntry.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.missedOpportunity.deleteMany();
  await prisma.cRMActivity.deleteMany();
  await prisma.cRMDeal.deleteMany();
  await prisma.dMMessage.deleteMany();
  await prisma.dMConversation.deleteMany();
  await prisma.socialComment.deleteMany();
  await prisma.inboxItem.deleteMany();
  await prisma.insight.deleteMany();
  await prisma.escalationTicket.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.metaWebhook.deleteMany();
  await prisma.metaConnection.deleteMany();
  await prisma.reEngagementRule.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.knowledgeDocument.deleteMany();
  await prisma.cTAConfig.deleteMany();
  await prisma.brandSettings.deleteMany();
  await prisma.metaWebhook.deleteMany();
  await prisma.metaConnection.deleteMany();
  await prisma.reportDelivery.deleteMany();
  await prisma.commissionRecord.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.followerSnapshot.deleteMany();
  await prisma.reEngagementRule.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.webhookConfig.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.customerMemory.deleteMany();
  await prisma.usageRecord.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
}

// Global setup
beforeAll(async () => {
  const prisma = getTestPrisma();
  await prisma.$connect();
});

// Global teardown
afterAll(async () => {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
});
