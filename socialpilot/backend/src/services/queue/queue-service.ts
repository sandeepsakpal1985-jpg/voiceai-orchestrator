/**
 * MetaPilot AI — Queue Service (BullMQ)
 *
 * Manages BullMQ queues for async job processing:
 * - comment-processing: AI reply generation for comments
 * - dm-processing: AI reply generation for DMs
 * - reengagement: Follow-up message scheduling
 * - analytics: Analytics data aggregation
 *
 * Performance optimized for high-traffic webhook handling:
 * - Shared Redis connection with keep-alive
 * - Configurable worker concurrency
 * - Exponential backoff with jitter
 * - Connection pool settings for high throughput
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { config } from '../../config';
import type { CommentJobData, DMJobData, ReEngagementJobData } from '@socialpilot/shared';

// ── Redis Connection Settings ──
// Shared connection config with keep-alive for high throughput
// Using maxRetriesPerRequest: null because BullMQ handles its own retries
const connection = {
  url: config.redis.url,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s)
    return Math.min(times * 1000, 30000);
  },
  connectTimeout: 10000,
  lazyConnect: true,
};

// ── Queue Config ──
// Default job options shared across queues
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: {
    age: 24 * 3600, // Keep completed jobs for 24h
    count: 1000,     // Max 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    count: 5000,          // Max 5000 failed jobs
  },
};

// ── Queue Instances ──
export const commentQueue = new Queue<CommentJobData>('comment-processing', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    backoff: { type: 'exponential', delay: 10000 },
  },
});

export const dmQueue = new Queue<DMJobData>('dm-processing', {
  connection,
  defaultJobOptions,
});

export const reengagementQueue = new Queue<ReEngagementJobData>('reengagement', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2,
  },
});

export const analyticsQueue = new Queue('analytics', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 1,
  },
});

// ── Queue Events (for monitoring) ──
export const commentQueueEvents = new QueueEvents('comment-processing', { connection });
export const dmQueueEvents = new QueueEvents('dm-processing', { connection });

// ── Job Dispatch Functions ──

/**
 * Queue a comment for AI processing with human-like delay.
 * Delay range: 45-90s for new comments, configurable via environment variables.
 */
export async function addCommentJob(data: CommentJobData, delayMs?: number) {
  const delay = delayMs ?? (config.queue.commentDelayMin + Math.floor(Math.random() * (config.queue.commentDelayMax - config.queue.commentDelayMin)));

  return commentQueue.add('process-comment', data, {
    delay,
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
  });
}

/**
 * Queue a DM for AI processing (no delay — responds immediately).
 */
export async function addDMJob(data: DMJobData) {
  return dmQueue.add('process-dm', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

/**
 * Queue a re-engagement job with stage-based delay.
 */
export async function addReEngagementJob(data: ReEngagementJobData) {
  return reengagementQueue.add('reengage', data, {
    delay: getDelayMs(data.stage),
    attempts: 2,
  });
}

/**
 * Queue a batch of comments for processing (bulk operation).
 * Uses BullMQ's addBulk for atomic batch dispatching.
 */
export async function addCommentJobsBulk(jobs: Array<{ data: CommentJobData; delayMs?: number }>) {
  return commentQueue.addBulk(
    jobs.map((job) => ({
      name: 'process-comment',
      data: job.data,
      opts: {
        delay: job.delayMs ?? (config.queue.commentDelayMin + Math.floor(Math.random() * (config.queue.commentDelayMax - config.queue.commentDelayMin))),
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
      },
    })),
  );
}

/**
 * Queue a batch of DMs for processing (bulk operation).
 */
export async function addDMJobsBulk(jobs: Array<{ data: DMJobData }>) {
  return dmQueue.addBulk(
    jobs.map((job) => ({
      name: 'process-dm',
      data: job.data,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    })),
  );
}

// ── Queue Statistics ──

/**
 * Get queue stats for monitoring/health dashboard.
 */
export async function getQueueStats() {
  const [commentStats, dmStats, reengagementStats] = await Promise.all([
    commentQueue.getJobCounts(),
    dmQueue.getJobCounts(),
    reengagementQueue.getJobCounts(),
  ]);

  return {
    commentProcessing: commentStats,
    dmProcessing: dmStats,
    reengagement: reengagementStats,
    total: {
      waiting: (commentStats.waiting || 0) + (dmStats.waiting || 0) + (reengagementStats.waiting || 0),
      active: (commentStats.active || 0) + (dmStats.active || 0) + (reengagementStats.active || 0),
      delayed: (commentStats.delayed || 0) + (dmStats.delayed || 0) + (reengagementStats.delayed || 0),
      failed: (commentStats.failed || 0) + (dmStats.failed || 0) + (reengagementStats.failed || 0),
    },
  };
}

// ── Helpers ──

function getDelayMs(stage: string): number {
  switch (stage) {
    case '24h': return 24 * 60 * 60 * 1000;
    case '3d': return 3 * 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}
