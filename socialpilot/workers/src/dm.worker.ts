import { Worker, Job } from 'bullmq';
import { config } from '../../backend/src/config';
import { runDMPipeline } from '../../backend/src/mastra';
import { initSentry, captureException, flushSentry } from '../../backend/src/services/sentry/sentry';
import { publishWsEvent } from '../../backend/src/services/websocket/event-bus';
import type { DMJobData } from '../../packages/shared/src/types';

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
      console.log(`DM worker: Redis connection verified at ${config.redis.url}`);
      return;
    } catch (err) {
      console.warn(`DM worker: Redis not ready (attempt ${attempt}/${maxRetries})`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelayMs));
      } else {
        console.error(`DM worker: Redis connection failed after ${maxRetries} attempts. Exiting.`);
        process.exit(1);
      }
    }
  }
}

// Run healthcheck before starting
checkRedisConnection().then(() => {
  const worker = new Worker<DMJobData>(
    'dm-processing',
  async (job: Job<DMJobData>) => {
    const { conversationId, userId, platform, senderId, content } = job.data;
    console.log(`Processing DM ${conversationId} via Mastra pipeline`);

    const result = await runDMPipeline({
      conversationId,
      userId,
      platform,
      senderId,
      content,
    });

    console.log(`DM ${conversationId} processed - (lead: ${result.leadId || 'none'})`);

    // Broadcast events via Redis event bus for WebSocket notification
    if (result.leadId) {
      publishWsEvent('inbox:new', {
        inbox: {
          id: conversationId,
          customerHandle: senderId,
          content: content.slice(0, 500),
          platform,
          priority: 'normal',
          status: 'unread',
        },
      }).catch(() => {});
    }

    return result;
  },
  { connection },
);

worker.on('completed', (job) => {
  console.log(`DM Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`DM Job ${job?.id} failed:`, err);
  captureException(err, {
    jobId: job?.id,
    queue: 'dm-processing',
    conversationId: job?.data?.conversationId,
    userId: job?.data?.userId,
  });
});

// Flush Sentry before exiting
process.on('SIGTERM', async () => { await flushSentry(); });
process.on('SIGINT', async () => { await flushSentry(); });

console.log('DM worker started (Mastra pipeline)');
});
