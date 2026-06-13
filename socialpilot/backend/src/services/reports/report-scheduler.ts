/**
 * MetaPilot AI — Report Scheduler & Email Delivery
 *
 * Handles automated report generation, email delivery via Resend,
 * and cron scheduling for weekly/monthly reports.
 */

import { PrismaClient } from '@prisma/client';
import { generateReportHtml, gatherReportMetrics } from './report-generator';

// Lazy-loaded Resend client
let _resendClient: any = null;

function getResendClient(): any {
  if (_resendClient) return _resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const { Resend } = require('resend');
    _resendClient = new Resend(apiKey);
    return _resendClient;
  } catch {
    console.warn('[ReportScheduler] Resend not available — email delivery disabled');
    return null;
  }
}

export class ReportScheduler {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Generate a report for a user and optionally email it.
   */
  async generateAndDeliver(
    userId: string,
    options?: { type?: 'manual' | 'scheduled'; emailOverride?: string },
  ): Promise<{
    success: boolean;
    delivered: boolean;
    metrics?: any;
    error?: string;
  }> {
    const type = options?.type || 'manual';

    try {
      // Get user's report config
      const settings = await this.prisma.brandSettings.findUnique({
        where: { userId },
      });

      const storedConfig: Record<string, any> = {};
      if (settings?.customInstructions) {
        try { Object.assign(storedConfig, JSON.parse(settings.customInstructions)); }
        catch { /* ignore */ }
      }

      const reportConfig = storedConfig.reportConfig || {};
      const emailTo = options?.emailOverride || reportConfig.email;

      // Gather metrics
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      const metrics = await gatherReportMetrics(this.prisma, userId, startDate, endDate);

      // Generate HTML
      const html = generateReportHtml(metrics);

      // Create delivery record
      const delivery = await this.prisma.reportDelivery.create({
        data: {
          userId,
          type,
          status: emailTo ? 'pending' : 'sent', // If no email, mark as sent (no delivery needed)
          metrics: metrics as any,
          emailTo: emailTo || null,
        },
      });

      let delivered = false;

      // Send email if configured
      if (emailTo) {
        const resend = getResendClient();
        if (resend) {
          try {
            const { data, error } = await resend.emails.send({
              from: `${settings?.businessName || 'MetaPilot AI'} <reports@metapilot.ai>`,
              to: emailTo,
              subject: `📊 ${settings?.businessName || 'Your'} Monthly Performance Report`,
              html,
            });

            if (error) throw new Error(error.message);

            await this.prisma.reportDelivery.update({
              where: { id: delivery.id },
              data: {
                status: 'sent',
                deliveredAt: new Date(),
              },
            });
            delivered = true;
          } catch (err: any) {
            await this.prisma.reportDelivery.update({
              where: { id: delivery.id },
              data: {
                status: 'failed',
                errorMessage: err?.message || 'Email delivery failed',
              },
            });
            console.error('[ReportScheduler] Email delivery failed:', err?.message);
          }
        } else {
          console.warn('[ReportScheduler] Resend not configured — email not sent');
        }
      }

      return {
        success: true,
        delivered,
        metrics,
      };
    } catch (err: any) {
      console.error('[ReportScheduler] Generate failed:', err?.message);
      // Record failure
      try {
        await this.prisma.reportDelivery.create({
          data: {
            userId,
            type,
            status: 'failed',
            errorMessage: err?.message || 'Generation failed',
          },
        });
      } catch { /* ignore */ }

      return { success: false, delivered: false, error: err?.message || 'Report generation failed' };
    }
  }

  /**
   * Get delivery history for a user.
   */
  async getHistory(userId: string, limit: number = 20) {
    const deliveries = await this.prisma.reportDelivery.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return deliveries.map(d => ({
      id: d.id,
      type: d.type,
      status: d.status,
      emailTo: d.emailTo,
      errorMessage: d.errorMessage,
      generatedAt: d.createdAt.toISOString(),
      deliveredAt: d.deliveredAt?.toISOString() || null,
      summary: d.metrics ? extractSummary(d.metrics as any) : null,
    }));
  }
}

/**
 * Extract a short summary string from report metrics.
 */
function extractSummary(metrics: any): string {
  if (!metrics) return '';
  const leads = metrics.leads?.captured || 0;
  const revenue = metrics.revenue?.total || 0;
  const deals = metrics.revenue?.dealsWon || 0;
  return `${leads} leads, ${deals} deals won, ₹${(revenue / 100).toLocaleString('en-IN')} revenue`;
}
