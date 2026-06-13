/**
 * MetaPilot AI — Cron Service
 *
 * Lightweight in-process scheduler for periodic tasks.
 * Uses setInterval with appropriate delays for dev/staging.
 *
 * Tasks:
 *   - Daily follower snapshot (every 24h)
 *   - Report generation check (every hour)
 *
 * In production, replace this with a proper cron job (e.g., GitHub Actions,
 * cron triggers on Railway, or a separate worker process).
 */

import { PrismaClient } from '@prisma/client';
import { FollowerGrowthService } from '../meta/follower-growth';
import { ReportScheduler } from '../reports/report-scheduler';

const LOG_PREFIX = '[CronService]';

// ── Intervals ──
const FOLLOWER_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const REPORT_CHECK_INTERVAL_MS = 60 * 60 * 1000;             // 1h
const TOKEN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;        // 6h — check tokens twice daily

// Track the last run date per userId for follower snapshots (avoid double-run)
const _lastFollowerSnapshot: Record<string, string> = {};

export class CronService {
  private prisma: PrismaClient;
  private followerService: FollowerGrowthService;
  private reportScheduler: ReportScheduler;

  private followerTimer: ReturnType<typeof setInterval> | null = null;
  private reportTimer: ReturnType<typeof setInterval> | null = null;
  private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.followerService = new FollowerGrowthService(prisma as any);
    this.reportScheduler = new ReportScheduler(prisma as any);
  }

  /**
   * Start all cron jobs.
   */
  start() {
    if (this.running) return;
    this.running = true;

    console.log(`${LOG_PREFIX} Starting cron service...`);

    // ── Follower Snapshot: runs immediately on start, then every 24h ──
    this.runFollowerSnapshot(); // First run immediately
    this.followerTimer = setInterval(() => {
      this.runFollowerSnapshot();
    }, FOLLOWER_SNAPSHOT_INTERVAL_MS);

    // ── Report Check: runs after 5 min delay, then every hour ──
    setTimeout(() => this.runReportCheck(), 5 * 60 * 1000);
    this.reportTimer = setInterval(() => {
      this.runReportCheck();
    }, REPORT_CHECK_INTERVAL_MS);

    // ── Token Auto-Refresh: runs after 2 min delay, then every 6 hours ──
    setTimeout(() => this.runTokenRefresh(), 2 * 60 * 1000);
    this.tokenRefreshTimer = setInterval(() => {
      this.runTokenRefresh();
    }, TOKEN_REFRESH_INTERVAL_MS);

    console.log(`${LOG_PREFIX} Cron service started successfully`);
    console.log(
      `${LOG_PREFIX} Follower snapshots: every ${FOLLOWER_SNAPSHOT_INTERVAL_MS / 1000 / 60 / 60}h`,
    );
    console.log(
      `${LOG_PREFIX} Report checks: every ${REPORT_CHECK_INTERVAL_MS / 1000 / 60}min`,
    );
    console.log(
      `${LOG_PREFIX} Token auto-refresh: every ${TOKEN_REFRESH_INTERVAL_MS / 1000 / 60 / 60}h`,
    );
  }

  /**
   * Stop all cron jobs gracefully.
   */
  stop() {
    if (!this.running) return;

    if (this.followerTimer) clearInterval(this.followerTimer);
    if (this.reportTimer) clearInterval(this.reportTimer);
    if (this.tokenRefreshTimer) clearInterval(this.tokenRefreshTimer);

    this.followerTimer = null;
    this.reportTimer = null;
    this.tokenRefreshTimer = null;
    this.running = false;

    console.log(`${LOG_PREFIX} Cron service stopped`);
  }

  /**
   * Run follower snapshot for all users with active Meta connections.
   * Skips users who were already snapshotted today.
   */
  private async runFollowerSnapshot() {
    const today = new Date().toISOString().slice(0, 10);

    try {
      const connections = await this.prisma.metaConnection.findMany({
        where: { status: 'active' },
        select: { userId: true },
        distinct: ['userId'],
      });

      let recorded = 0;
      for (const conn of connections) {
        // Skip if already recorded today
        if (_lastFollowerSnapshot[conn.userId] === today) continue;

        try {
          const result = await this.followerService.recordDailySnapshot(conn.userId);
          if (result.snapshots.length > 0) {
            recorded += result.snapshots.length;
            _lastFollowerSnapshot[conn.userId] = today;
          }
        } catch (err: any) {
          console.error(
            `${LOG_PREFIX} Follower snapshot failed for user ${conn.userId}:`,
            err?.message,
          );
        }
      }

      if (recorded > 0) {
        console.log(`${LOG_PREFIX} Recorded ${recorded} follower snapshot(s)`);
      }
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Follower snapshot run failed:`, err?.message);
    }
  }

  /**
   * Check for users with scheduled reports enabled and generate them.
   */
  private async runReportCheck() {
    try {
      const usersWithReports = await this.prisma.brandSettings.findMany({
        where: {
          customInstructions: {
            contains: '"enabled":true',
          },
        },
        select: {
          userId: true,
          customInstructions: true,
        },
      });

      if (usersWithReports.length === 0) return;

      let generated = 0;
      for (const settings of usersWithReports) {
        try {
          // Parse the stored config to check schedule
          let config: Record<string, any> = {};
          if (settings.customInstructions) {
            try {
              config = JSON.parse(settings.customInstructions);
            } catch { continue; }
          }

          const reportConfig = config.reportConfig || {};
          if (!reportConfig.enabled) continue;

          // Check if we should generate based on frequency
          const frequency = reportConfig.frequency || 'monthly';
          if (!this.shouldGenerateReport(settings.userId, frequency)) continue;

          const result = await this.reportScheduler.generateAndDeliver(
            settings.userId,
            { type: 'scheduled' },
          );

          if (result.success) {
            generated++;
            console.log(
              `${LOG_PREFIX} Report generated for user ${settings.userId}` +
                (result.delivered ? ' (delivered)' : ''),
            );
          }
        } catch (err: any) {
          console.error(
            `${LOG_PREFIX} Report generation failed for user ${settings.userId}:`,
            err?.message,
          );
        }
      }

      if (generated > 0) {
        console.log(`${LOG_PREFIX} Generated ${generated} report(s)`);
      }
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Report check run failed:`, err?.message);
    }
  }

  /**
   * Auto-refresh Meta access tokens that are expiring within 7 days.
   * Meta long-lived tokens last 60 days. We refresh them when they have
   * <= 7 days remaining to prevent service interruption.
   */
  private async runTokenRefresh() {
    try {
      const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

      // Find connections where token expires within 7 days
      const expiringConnections = await this.prisma.metaConnection.findMany({
        where: {
          status: 'active',
          tokenExpiresAt: {
            lte: new Date(Date.now() + SEVEN_DAYS_MS),
            gte: new Date(), // Not already expired (those need reconnection)
          },
        },
        select: { id: true, userId: true, accessToken: true },
      });

      if (expiringConnections.length === 0) return;

      let refreshed = 0;
      for (const conn of expiringConnections) {
        try {
          // Exchange the existing long-lived token for a new one
          const params = new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: process.env.META_APP_ID || '',
            client_secret: process.env.META_APP_SECRET || '',
            fb_exchange_token: conn.accessToken,
          });

          const res = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params.toString()}`, {
            signal: AbortSignal.timeout(10000),
          });

          if (!res.ok) {
            console.warn(`${LOG_PREFIX} Token refresh failed for connection ${conn.id}: HTTP ${res.status}`);
            continue;
          }

          const data: any = await res.json();
          if (data.access_token) {
            await this.prisma.metaConnection.update({
              where: { id: conn.id },
              data: {
                accessToken: data.access_token,
                tokenExpiresAt: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
              },
            });
            refreshed++;
            console.log(`${LOG_PREFIX} Auto-refreshed token for connection ${conn.id}`);
          }
        } catch (err: any) {
          console.error(`${LOG_PREFIX} Token refresh failed for connection ${conn.id}:`, err?.message);
        }
      }

      if (refreshed > 0) {
        console.log(`${LOG_PREFIX} Refreshed ${refreshed} expiring token(s)`);
      }
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Token refresh run failed:`, err?.message);
    }
  }

  /**
   * Simple schedule check — only generate if we haven't in the configured period.
   */
  private async shouldGenerateReport(
    userId: string,
    frequency: string,
  ): Promise<boolean> {
    const lastDelivery = await this.prisma.reportDelivery.findFirst({
      where: { userId, type: 'scheduled', status: 'sent' },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastDelivery) return true; // Never sent — generate

    const daysSinceLast = (Date.now() - lastDelivery.createdAt.getTime()) /
      (24 * 60 * 60 * 1000);

    switch (frequency) {
      case 'daily':
        return daysSinceLast >= 1;
      case 'weekly':
        return daysSinceLast >= 7;
      case 'monthly':
      default:
        return daysSinceLast >= 28;
    }
  }
}
