import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";

// ── Types ──────────────────────────────────────────────────────────

export interface ActiveCallRecord {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  duration: number | null;
  status: string | null;
  sentiment: string | null;
  createdAt: Date;
}

export interface CallTimestamp {
  id?: string;
  duration?: number | null;
  createdAt: Date;
  status?: string;
}

export interface LiveMonitoringRaw {
  activeCalls: ActiveCallRecord[];
  todayTotal: number;
  todayCompleted: number;
  inProgressCount: number;
  totalUsers: number;
  queuedOrRinging: CallTimestamp[];
  recentCompleted: { createdAt: Date; startedAt: Date | null }[];
}

export interface RealtimeDashboardRaw {
  activeCount: number;
  todayTotal: number;
  yesterdayTotal: number;
  inQueueCount: number;
  inProgressCalls: CallTimestamp[];
  queuedCalls: CallTimestamp[];
  ringingCalls: CallTimestamp[];
  recentCompleted: CallTimestamp[];
  totalAgents: number;
}

// ── Date helpers ────────────────────────────────────────────────────

export function getTodayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getYesterdayStart(todayStart: Date): Date {
  const d = new Date(todayStart);
  d.setDate(d.getDate() - 1);
  return d;
}

// ── Live Monitoring Queries ─────────────────────────────────────────

export async function getLiveMonitoringData(
  userId?: string | null
): Promise<LiveMonitoringRaw> {
  const todayStart = getTodayStart();

  const whereUser: Prisma.CallLogWhereInput = userId ? { userId } : {};

  const [activeCalls, todayTotal, todayCompleted, inProgressCount, totalUsers] =
    await Promise.all([
      prisma.callLog.findMany({
        where: { ...whereUser, status: "IN_PROGRESS" } as Prisma.CallLogWhereInput,
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          contactName: true,
          contactPhone: true,
          duration: true,
          status: true,
          sentiment: true,
          createdAt: true,
        },
      }),
      prisma.callLog.count({
        where: { ...whereUser, createdAt: { gte: todayStart } } as Prisma.CallLogWhereInput,
      }),
      prisma.callLog.count({
        where: {
          ...whereUser,
          status: "COMPLETED",
          createdAt: { gte: todayStart },
        } as Prisma.CallLogWhereInput,
      }),
      prisma.callLog.count({
        where: { status: "IN_PROGRESS" } as Prisma.CallLogWhereInput,
      }),
      prisma.user.count(),
    ]);

  const queuedOrRinging = await prisma.callLog.findMany({
    where: {
      ...whereUser,
      status: { in: ["QUEUED", "RINGING"] },
    } as Prisma.CallLogWhereInput,
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, createdAt: true, status: true },
  });

  // Recent completed for avg wait calculation
  const recentCompleted = userId
    ? await prisma.callLog.findMany({
        where: {
          userId,
          status: "COMPLETED",
          startedAt: { not: null },
          createdAt: { gte: todayStart },
        } as Prisma.CallLogWhereInput,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { createdAt: true, startedAt: true },
      })
    : [];

  return {
    activeCalls: activeCalls as ActiveCallRecord[],
    todayTotal,
    todayCompleted,
    inProgressCount,
    totalUsers,
    queuedOrRinging,
    recentCompleted,
  };
}

// ── Realtime Dashboard Queries ──────────────────────────────────────

export async function getRealtimeDashboardData(
  userId?: string | null
): Promise<RealtimeDashboardRaw> {
  const todayStart = getTodayStart();
  const yesterdayStart = getYesterdayStart(todayStart);

  const whereUser: Prisma.CallLogWhereInput = userId ? { userId } : {};

  const [
    activeCount,
    todayTotal,
    inQueueCount,
    yesterdayTotal,
    inProgressCalls,
    queuedCalls,
    ringingCalls,
    recentCompleted,
    totalAgents,
  ] = await Promise.all([
    prisma.callLog.count({
      where: { ...whereUser, status: "IN_PROGRESS" } as Prisma.CallLogWhereInput,
    }),
    prisma.callLog.count({
      where: { ...whereUser, createdAt: { gte: todayStart } } as Prisma.CallLogWhereInput,
    }),
    prisma.callLog.count({
      where: {
        ...whereUser,
        status: { in: ["QUEUED", "RINGING"] },
      } as Prisma.CallLogWhereInput,
    }),
    prisma.callLog.count({
      where: {
        ...whereUser,
        createdAt: { gte: yesterdayStart, lt: todayStart },
      } as Prisma.CallLogWhereInput,
    }),
    prisma.callLog.findMany({
      where: { ...whereUser, status: "IN_PROGRESS" } as Prisma.CallLogWhereInput,
      select: { id: true, duration: true, createdAt: true },
    }),
    prisma.callLog.findMany({
      where: { ...whereUser, status: "QUEUED" } as Prisma.CallLogWhereInput,
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.callLog.findMany({
      where: { ...whereUser, status: "RINGING" } as Prisma.CallLogWhereInput,
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.callLog.findMany({
      where: {
        ...whereUser,
        status: "COMPLETED",
        createdAt: { gte: todayStart },
      } as Prisma.CallLogWhereInput,
      select: { duration: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.count(),
  ]);

  return {
    activeCount,
    todayTotal,
    yesterdayTotal,
    inQueueCount,
    inProgressCalls,
    queuedCalls,
    ringingCalls,
    recentCompleted,
    totalAgents,
  };
}

// ── Utility functions ───────────────────────────────────────────────

export function formatDuration(durationSeconds: number | null): string {
  if (!durationSeconds) return "0m 00s";
  const m = Math.floor(durationSeconds / 60);
  const s = Math.round(durationSeconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function calcAvgWaitSeconds(
  records: { createdAt: Date; startedAt: Date | null }[]
): number {
  if (records.length === 0) return 45;
  const waits = records
    .map((c) => {
      if (c.createdAt && c.startedAt) {
        return (c.startedAt.getTime() - c.createdAt.getTime()) / 1000;
      }
      return null;
    })
    .filter((w): w is number => w !== null && w > 0);
  if (waits.length === 0) return 45;
  return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
}

export function calcAvgWaitFromTimestamps(dates: Date[]): number {
  if (dates.length === 0) return 32;
  const now = new Date();
  const waits = dates.map((d) => (now.getTime() - d.getTime()) / 1000).filter((w) => w > 0);
  if (waits.length === 0) return 32;
  return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
}

export function calcPercentChange(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}
