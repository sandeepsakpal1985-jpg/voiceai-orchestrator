/**
 * MetaPilot AI — Follower Growth Tracking Service
 *
 * Tracks Instagram and Facebook follower counts by calling Meta Graph API.
 * Provides daily snapshots for growth trend analysis.
 *
 * In production, this is called by a daily cron job. For now, it's
 * triggered on-demand via the insights endpoint.
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../../config';

const META_API_VERSION = 'v21.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class FollowerGrowthService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Fetch follower count from Meta Graph API for a given connection.
   * For Instagram: GET /{ig-user-id}?fields=followers_count,follows_count
   * For Facebook: GET /{page-id}?fields=followers_count,fan_count
   */
  async fetchCurrentFollowers(connection: {
    userId: string;
    instagramAccountId?: string | null;
    facebookPageId?: string | null;
    accessToken: string;
  }): Promise<{ platform: string; followers: number; follows: number } | null> {
    try {
      if (connection.instagramAccountId) {
        // Fetch Instagram Business Account follower count
        const params = new URLSearchParams({
          fields: 'followers_count,follows_count',
          access_token: connection.accessToken,
        });
        const res = await fetch(
          `${META_GRAPH_URL}/${connection.instagramAccountId}?${params.toString()}`
        );
        if (!res.ok) return null;
        const data: any = await res.json();
        return {
          platform: 'instagram',
          followers: data.followers_count ?? 0,
          follows: data.follows_count ?? 0,
        };
      }

      if (connection.facebookPageId) {
        // Fetch Facebook Page follower count
        const params = new URLSearchParams({
          fields: 'fan_count, followers_count',
          access_token: connection.accessToken,
        });
        const res = await fetch(
          `${META_GRAPH_URL}/${connection.facebookPageId}?${params.toString()}`
        );
        if (!res.ok) return null;
        const data: any = await res.json();
        return {
          platform: 'facebook',
          followers: data.fan_count ?? data.followers_count ?? 0,
          follows: 0, // Facebook doesn't expose follows_count via this API
        };
      }

      return null;
    } catch (err) {
      console.error('[FollowerGrowth] Failed to fetch:', err);
      return null;
    }
  }

  /**
   * Record a daily follower snapshot for all of a user's active connections.
   */
  async recordDailySnapshot(userId: string): Promise<{
    snapshots: Array<{ platform: string; followers: number }>;
  }> {
    const connections = await this.prisma.metaConnection.findMany({
      where: { userId, status: 'active' },
    });

    const snapshots: Array<{ platform: string; followers: number }> = [];

    for (const conn of connections) {
      const result = await this.fetchCurrentFollowers({
        userId: conn.userId,
        instagramAccountId: conn.instagramAccountId,
        facebookPageId: conn.facebookPageId,
        accessToken: conn.accessToken,
      });

      if (result) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Upsert to avoid duplicates
        await this.prisma.followerSnapshot.upsert({
          where: {
            userId_platform_snapshotDate: {
              userId,
              platform: result.platform,
              snapshotDate: today,
            },
          },
          update: {
            followers: result.followers,
            follows: result.follows,
          },
          create: {
            userId,
            platform: result.platform,
            followers: result.followers,
            follows: result.follows,
            snapshotDate: today,
          },
        });

        snapshots.push({ platform: result.platform, followers: result.followers });
      }
    }

    return { snapshots };
  }

  /**
   * Get follower growth data for the dashboard.
   */
  async getGrowthData(
    userId: string,
    days: number = 30,
  ): Promise<{
    current: Record<string, { followers: number; follows: number }>;
    history: Array<{ date: string; platform: string; followers: number }>;
    growth: Record<string, { gained: number; netGrowth: number; growthPercent: number }>;
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    const snapshots = await this.prisma.followerSnapshot.findMany({
      where: { userId, snapshotDate: { gte: startDate } },
      orderBy: { snapshotDate: 'asc' },
    });

    // Group by platform
    const byPlatform: Record<string, typeof snapshots> = {};
    for (const s of snapshots) {
      if (!byPlatform[s.platform]) byPlatform[s.platform] = [];
      byPlatform[s.platform].push(s);
    }

    // Current values (latest snapshot per platform)
    const current: Record<string, { followers: number; follows: number }> = {};
    for (const [platform, snaps] of Object.entries(byPlatform)) {
      const latest = snaps[snaps.length - 1];
      current[platform] = { followers: latest.followers, follows: latest.follows };
    }

    // History for charts
    const history = snapshots.map(s => ({
      date: s.snapshotDate.toISOString().slice(0, 10),
      platform: s.platform,
      followers: s.followers,
    }));

    // Growth calculations
    const growth: Record<string, { gained: number; netGrowth: number; growthPercent: number }> = {};
    for (const [platform, snaps] of Object.entries(byPlatform)) {
      if (snaps.length < 2) {
        growth[platform] = { gained: 0, netGrowth: 0, growthPercent: 0 };
        continue;
      }
      const first = snaps[0];
      const last = snaps[snaps.length - 1];
      const gained = last.followers - first.followers;
      const netGrowth = gained; // Net = gained since we don't track unfollows per-user
      const growthPercent = first.followers > 0
        ? Math.round((gained / first.followers) * 100 * 100) / 100
        : 0;
      growth[platform] = { gained: Math.max(0, gained), netGrowth, growthPercent };
    }

    return { current, history, growth };
  }
}
