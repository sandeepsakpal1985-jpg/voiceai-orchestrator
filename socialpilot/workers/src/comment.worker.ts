import { Worker, Job } from 'bullmq';
import { config } from '../../backend/src/config';
import { runCommentPipeline } from '../../backend/src/mastra';
import { initSentry, captureException, flushSentry } from '../../backend/src/services/sentry/sentry';
import { publishWsEvent } from '../../backend/src/services/websocket/event-bus';
import type { CommentJobData } from '../../packages/shared/src/types';

// Initialize Sentry for worker process
initSentry();

const connection = { url: config.redis.url };

// Redis connection healthcheck — verify connectivity before starting worker
async function checkRedisConnection(): Promise<void> {
  const maxRetries = 10;
  const retryDelayMs = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { Redis } = await import('ioredis');
      const testClient = new Redis(config.redis.url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        lazyConnect: true,
      });
      await testClient.connect();
      await testClient.ping();
      await testClient.quit();
      console.log(`Comment worker: Redis connection verified at ${config.redis.url}`);
      return;
    } catch (err) {
      console.warn(`Comment worker: Redis not ready (attempt ${attempt}/${maxRetries})`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelayMs));
      } else {
        console.error(`Comment worker: Redis connection failed after ${maxRetries} attempts. Exiting.`);
        process.exit(1);
      }
    }
  }
}

// Run healthcheck before starting
checkRedisConnection().then(() => {
  const worker = new Worker<CommentJobData>(
    'comment-processing',
  async (job: Job<CommentJobData>) => {
    const { commentId, userId, platform, authorId, authorName, content } = job.data;
    console.log(`Processing comment ${commentId} via Mastra pipeline`);

    const result = await runCommentPipeline({
      commentId,
      userId,
      platform,
      authorId,
      authorName: authorName || 'Unknown',
      content,
    });

    console.log(`Comment ${commentId} processed - (lead: ${result.leadId || 'none'})`);

    // Broadcast events via Redis event bus for WebSocket notification
    if (result.leadId) {
      publishWsEvent('inbox:new', {
        inbox: {
          id: commentId,
          customerHandle: authorId,
          customerName: authorName,
          content: content.slice(0, 500),
          platform,
          priority: result.replyStatus === 'escalated' ? 'high' : 'normal',
          status: result.replyStatus === 'escalated' ? 'escalated' : 'unread',
        },
      }).catch(() => {});
    }

    return result;
  },
  { connection },
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
  captureException(err, {
    jobId: job?.id,
    queue: 'comment-processing',
    commentId: job?.data?.commentId,
    userId: job?.data?.userId,
  });
});

// Flush Sentry before exiting
process.on('SIGTERM', async () => { await flushSentry(); });
process.on('SIGINT', async () => { await flushSentry(); });

console.log('Comment worker started (Mastra pipeline)');
});
