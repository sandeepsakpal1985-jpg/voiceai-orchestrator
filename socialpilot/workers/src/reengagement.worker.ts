import { Worker, Job } from 'bullmq';
import { config } from '../../backend/src/config';
import { generateCompletion } from '../../backend/src/services/ai/llm';
import { isN8nConfigured, triggerReengagement } from '../../backend/src/services/n8n/n8n-service';
import { initSentry, captureException, flushSentry } from '../../backend/src/services/sentry/sentry';
import type { ReEngagementJobData } from '../../packages/shared/src/types';

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
      console.log(`Re-engagement worker: Redis connection verified at ${config.redis.url}`);
      return;
    } catch (err) {
      console.warn(`Re-engagement worker: Redis not ready (attempt ${attempt}/${maxRetries})`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelayMs));
      } else {
        console.error(`Re-engagement worker: Redis connection failed after ${maxRetries} attempts. Exiting.`);
        process.exit(1);
      }
    }
  }
}

// Run healthcheck before starting
checkRedisConnection().then(() => {
  const worker = new Worker<ReEngagementJobData>(
    'reengagement',
  async (job: Job<ReEngagementJobData>) => {
    const { customerId, userId, stage, customerName, leadScore } = job.data;
    console.log(`Re-engagement: ${customerId} (${stage})`);

    // If n8n is configured, delegate to n8n webhook workflow
    if (isN8nConfigured()) {
      try {
        const result = await triggerReengagement({
          customerId,
          userId,
          stage,
          customerName: customerName || customerId,
          leadScore: leadScore || 0,
        });

        if (result.triggered) {
          console.log(`Delegated ${customerId} (${stage}) to n8n:`, result.data);
          return { delegatedTo: 'n8n', result: result.data };
        }

        console.warn(`n8n trigger failed for ${customerId} (${stage}): ${result.error} — falling back to inline`);
      } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          jobId: job.id,
          queue: 'reengagement',
          customerId,
          stage,
        });
        console.error(`n8n trigger error for ${customerId} (${stage}) — falling back to inline`);
      }
    }

    // Fallback: generate re-engagement message inline via LLM
    const response = await generateCompletion({
      systemPrompt: `You are an AI sales assistant sending a re-engagement message.
Stage: ${stage} (24h = 1 day follow-up, 3d = 3 day follow-up, 7d = final follow-up)

Rules:
- Reference their previous interest
- Be helpful, not pushy
- Ask if they have questions
- For 7d stage, mention this is the last check-in`,
      messages: [{ role: 'user', content: `Re-engage customer ${customerId}` }],
      temperature: 0.8,
      maxTokens: 150,
    });

    console.log(`Re-engagement message for ${customerId}: ${response}`);
    return { delegatedTo: 'inline', response };
  },
  { connection },
);

worker.on('failed', (job, err) => {
  captureException(err, {
    jobId: job?.id,
    queue: 'reengagement',
    customerId: job?.data?.customerId,
  });
});

// Flush Sentry before exiting
process.on('SIGTERM', async () => { await flushSentry(); });
process.on('SIGINT', async () => { await flushSentry(); });

console.log('Re-engagement worker started');
});
