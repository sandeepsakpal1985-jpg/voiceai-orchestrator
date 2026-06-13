/**
 * MetaPilot AI — Customer Reporting Engine
 *
 * Provides endpoints for scheduled monthly reports delivered via email:
 * - GET  /api/reports/config     — Get report configuration
 * - PUT  /api/reports/config     — Update report configuration
 * - POST /api/reports/generate   — Generate and send a report immediately
 * - GET  /api/reports/history    — Past report delivery history
 * - POST /api/reports/schedule   — Trigger scheduled report generation
 *
 * Reports include: leads captured, conversations handled, revenue attributed,
 * response metrics, reputation score, and top recommendations.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ReportScheduler } from '../../services/reports/report-scheduler';
import { generateReportHtml } from '../../services/reports/report-generator';
import type { ReportMetrics } from '../../services/reports/report-generator';

const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const scheduler = new ReportScheduler(fastify.prisma as any);

  // ── Get Report Configuration ──
  fastify.get(
    '/config',
    { preHandler: [fastify.authenticate as any] },
    async (request) => {
      const { userId } = await (request as any).authenticate();

      const settings = await fastify.prisma.brandSettings.findUnique({
        where: { userId },
        select: {
          businessName: true,
          customInstructions: true,
        },
      });

      let storedConfig: Record<string, any> = {};
      if (settings?.customInstructions) {
        try {
          storedConfig = JSON.parse(settings.customInstructions);
        } catch {
          // Invalid JSON, use defaults
        }
      }

      const reportConfig = storedConfig.reportConfig || {};

      return {
        success: true,
        data: {
          enabled: reportConfig.enabled ?? false,
          frequency: reportConfig.frequency ?? 'monthly',
          email: reportConfig.email ?? null,
          includeRevenue: reportConfig.includeRevenue ?? true,
          includeLeads: reportConfig.includeLeads ?? true,
          includeConversations: reportConfig.includeConversations ?? true,
          includeReputation: reportConfig.includeReputation ?? true,
          includeRecommendations: reportConfig.includeRecommendations ?? true,
          dayOfMonth: reportConfig.dayOfMonth ?? 1,
          businessName: settings?.businessName || '',
        },
      };
    },
  );

  // ── Update Report Configuration ──
  fastify.put(
    '/config',
    { preHandler: [fastify.authenticate as any] },
    async (request, reply) => {
      const { userId } = await (request as any).authenticate();

      const schema = z.object({
        enabled: z.boolean(),
        frequency: z.enum(['weekly', 'monthly']),
        email: z.string().email().nullable(),
        includeRevenue: z.boolean().default(true),
        includeLeads: z.boolean().default(true),
        includeConversations: z.boolean().default(true),
        includeReputation: z.boolean().default(true),
        includeRecommendations: z.boolean().default(true),
        dayOfMonth: z.number().min(1).max(28).default(1),
      });

      const body = schema.parse(request.body);

      const existing = await fastify.prisma.brandSettings.findUnique({
        where: { userId },
        select: { customInstructions: true },
      });

      let existingData: Record<string, any> = {};
      if (existing?.customInstructions) {
        try {
          existingData = JSON.parse(existing.customInstructions);
        } catch {
          // Invalid JSON, start fresh
        }
      }

      existingData.reportConfig = body;

      await fastify.prisma.brandSettings.upsert({
        where: { userId },
        update: {
          customInstructions: JSON.stringify(existingData),
        },
        create: {
          userId,
          businessName: 'My Business',
          customInstructions: JSON.stringify({ reportConfig: body }),
        },
      });

      return {
        success: true,
        data: { ...body, savedAt: new Date().toISOString() },
      };
    },
  );

  // ── Generate Report ──
  fastify.post(
    '/generate',
    { preHandler: [fastify.authenticate as any] },
    async (request, reply) => {
      const { userId } = await (request as any).authenticate();

      try {
        const result = await scheduler.generateAndDeliver(userId, { type: 'manual' });
        const { success, metrics, error } = result;

        if (!success) {
          return reply.status(500).send({ success: false, error: error || 'Report generation failed' });
        }

        return {
          success: true,
          data: {
            metrics,
            html: generateReportHtml(metrics as any),
            generatedAt: new Date().toISOString(),
            emailed: result.delivered,
          },
        };
      } catch (err: any) {
        fastify.log.error('Report generation failed: %s', err?.message || err);
        return reply.status(500).send({
          success: false,
          error: 'Report generation failed. Please try again.',
        });
      }
    },
  );

  // ── Report History ──
  fastify.get(
    '/history',
    { preHandler: [fastify.authenticate as any] },
    async (request) => {
      const { userId } = await (request as any).authenticate();

      const deliveries = await scheduler.getHistory(userId);
      return { success: true, data: deliveries };
    },
  );

  // ── Scheduled Report Generation (called by cron) ──
  fastify.post(
    '/schedule',
    async (request, reply) => {
      // This endpoint should be called by a cron job (internal only)
      // Protected by a simple shared secret
      const body = request.body as any;
      const secret = body?.secret;
      const cronSecret = process.env.REPORT_CRON_SECRET || 'metapilot-report-cron-2024';

      if (secret !== cronSecret) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      // Find all users with report config enabled
      const allSettings = await fastify.prisma.brandSettings.findMany({
        where: {
          customInstructions: { contains: '"enabled":true' },
        },
        select: { userId: true },
      });

      const results: Array<{ userId: string; success: boolean }> = [];
      for (const s of allSettings) {
        const result = await scheduler.generateAndDeliver(s.userId, { type: 'scheduled' });
        results.push({ userId: s.userId, success: result.success });
      }

      return {
        success: true,
        data: {
          total: allSettings.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
        },
      };
    },
  );
};

export default reportRoutes;
