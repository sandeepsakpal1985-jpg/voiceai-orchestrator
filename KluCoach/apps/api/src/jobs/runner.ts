import { prisma } from "@klunex-edu/database";
import { applyLifecycle } from "../platform/billing/billing-service.js";
import { reconcileOpenPayments } from "../platform/payments/service.js";
import { writeSystemAudit } from "../platform/audit/write.js";

export const JOB_NAMES = {
  lifecycle: "billing.lifecycle",
  reconcile: "payment.reconcile",
} as const;

async function claim(name: string, dedupeKey: string) {
  const existing = await prisma.jobRun.findUnique({ where: { dedupeKey } });
  if (existing) return existing;
  try {
    return await prisma.jobRun.create({
      data: {
        name,
        dedupeKey,
        status: "RUNNING",
        scheduledFor: new Date(),
        startedAt: new Date(),
        attempt: 1,
      },
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "P2002") {
      return prisma.jobRun.findUnique({ where: { dedupeKey } });
    }
    throw err;
  }
}

export async function runNamedJob(name: string, asOf = new Date()) {
  const hourKey = asOf.toISOString().slice(0, 13);
  const dedupeKey = `${name}:${hourKey}`;
  const claimed = await claim(name, dedupeKey);
  if (!claimed) return { skipped: true, reason: "missing" };
  if (claimed.status === "SUCCEEDED") return { skipped: true, reason: "already_succeeded", id: claimed.id };
  if (claimed.status === "RUNNING" && claimed.startedAt && claimed.id && claimed.dedupeKey !== dedupeKey) {
    return { skipped: true, reason: "running" };
  }
  if (claimed.finishedAt && claimed.status === "SUCCEEDED") {
    return { skipped: true, reason: "duplicate", id: claimed.id };
  }
  try {
    const result =
      name === JOB_NAMES.lifecycle ? await applyLifecycle(asOf) : name === JOB_NAMES.reconcile ? await reconcileOpenPayments() : { unknown: true };
    await prisma.jobRun.update({
      where: { id: claimed.id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), result: result as object },
    });
    return { skipped: false, id: claimed.id, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "job_failed";
    await prisma.jobRun.update({
      where: { id: claimed.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    throw err;
  }
}

/** Hour bucket makes a second call in the same hour a no-op for notifications and job rows. */
export async function runDueJobs(asOf = new Date()) {
  const lifecycle = await runNamedJob(JOB_NAMES.lifecycle, asOf);
  const reconcile = await runNamedJob(JOB_NAMES.reconcile, asOf);
  await writeSystemAudit({
    action: "jobs.tick",
    entityType: "JobRun",
    metadata: { lifecycleSkipped: Boolean(lifecycle.skipped), reconcileSkipped: Boolean(reconcile.skipped) },
  });
  return { lifecycle, reconcile };
}
