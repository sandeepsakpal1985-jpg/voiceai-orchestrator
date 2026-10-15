import "server-only";
import { log } from "@/lib/logger";
import { ProviderRateLimitError } from "@/server/providers";
import { one, withWorker, type Sql } from "@/server/db";
import { deliverMessage, renewMailbox, syncMailbox } from "@/server/sync";

type JobRow = {
  id: string;
  organization_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

export async function enqueueJob(
  client: Sql,
  input: { organizationId: string; type: string; payload: Record<string, unknown>; dedupeKey?: string; maxAttempts?: number },
): Promise<void> {
  await client.query(
    `INSERT INTO background_jobs (organization_id, job_type, payload, dedupe_key, max_attempts)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (dedupe_key) WHERE status IN ('pending', 'running') AND dedupe_key IS NOT NULL DO NOTHING`,
    [input.organizationId, input.type, JSON.stringify(input.payload), input.dedupeKey ?? null, input.maxAttempts ?? 5],
  );
}

async function claimJob(): Promise<JobRow | null> {
  return withWorker(async (client) => {
    await client.query(
      `UPDATE background_jobs SET status = 'pending', locked_at = NULL
       WHERE status = 'running' AND locked_at < now() - interval '10 minutes'`,
    );
    return one<JobRow>(
      client,
      `UPDATE background_jobs
       SET status = 'running', locked_at = now(), locked_by = 'klumail-worker', attempts = attempts + 1
       WHERE id = (
         SELECT id FROM background_jobs
         WHERE status = 'pending' AND run_at <= now()
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, organization_id, job_type, payload, attempts, max_attempts`,
    );
  });
}

async function failJob(job: JobRow, error: unknown): Promise<void> {
  const rateLimited = error instanceof ProviderRateLimitError;
  const dead = !rateLimited && job.attempts >= job.max_attempts;
  const delay = rateLimited ? error.retryAfterSeconds : Math.min(900, 2 ** job.attempts);
  const message = error instanceof Error ? error.message.slice(0, 300) : "Job failed";
  await withWorker((client) =>
    client.query(
      `UPDATE background_jobs
       SET status = $2, run_at = now() + ($3 || ' seconds')::interval, last_error = $4, locked_at = NULL
       WHERE id = $1`,
      [job.id, dead ? "dead" : "pending", String(delay), message],
    ),
  );
  if (dead && job.job_type === "mailbox.sync") {
    log("error", "mailbox sync exhausted retries", { organizationId: job.organization_id, jobId: job.id });
  }
}

async function dispatch(job: JobRow): Promise<void> {
  const mailboxId = typeof job.payload.mailboxId === "string" ? job.payload.mailboxId : "";
  const messageId = typeof job.payload.messageId === "string" ? job.payload.messageId : "";
  if (job.job_type === "mailbox.sync") await syncMailbox(job.organization_id, mailboxId);
  else if (job.job_type === "message.send") await deliverMessage(job.organization_id, messageId);
  else if (job.job_type === "mailbox.renew") await renewMailbox(job.organization_id, mailboxId);
  else throw new Error(`Unknown job type ${job.job_type}`);
}

export async function enqueueReconciliation(): Promise<void> {
  await withWorker(async (client) => {
    const due = await client.query<{ id: string; organization_id: string }>("SELECT id, organization_id FROM mailboxes_due(5)");
    for (const mailbox of due.rows) {
      await enqueueJob(client, {
        organizationId: mailbox.organization_id,
        type: "mailbox.sync",
        payload: { mailboxId: mailbox.id },
        dedupeKey: `sync:${mailbox.id}`,
      });
    }
  });
}

export async function processAvailableJobs(limit = 10): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const job = await claimJob();
    if (!job) break;
    try {
      await dispatch(job);
      await withWorker((client) => client.query(`UPDATE background_jobs SET status = 'succeeded', locked_at = NULL, last_error = NULL WHERE id = $1`, [job.id]));
      processed += 1;
    } catch (error) {
      await failJob(job, error);
      failed += 1;
      log("warn", "background job failed", { jobType: job.job_type, organizationId: job.organization_id, error: error instanceof Error ? error.message : "job_failed" });
    }
  }
  return { processed, failed };
}

export async function kickJobs(): Promise<void> {
  await processAvailableJobs(10);
}
