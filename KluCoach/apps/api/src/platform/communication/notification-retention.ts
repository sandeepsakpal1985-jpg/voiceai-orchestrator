import { prisma } from "@klunex-edu/database";
import { NOTIFICATION_RETENTION_DAYS } from "@klunex-edu/shared";

/** Callable cleanup. Not scheduled — production must run this from a job runner. */
export async function purgeExpiredNotifications(retentionDays = NOTIFICATION_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const res = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return res.count;
}
