import "server-only";
import type { Sql } from "@/server/db";
import { one } from "@/server/db";

export async function notifyUsers(
  client: Sql,
  input: {
    organizationId: string;
    userIds: string[];
    actorUserId?: string | null;
    type: string;
    title: string;
    body?: string;
    ticketId?: string | null;
    dedupeKey: string;
  },
): Promise<void> {
  const unique = [...new Set(input.userIds)].filter((userId) => userId && userId !== input.actorUserId);
  for (const userId of unique) {
    const pref = await one<{ in_app: boolean }>(
      client,
      `SELECT in_app FROM notification_preferences WHERE organization_id = $1 AND user_id = $2 AND event_type = $3`,
      [input.organizationId, userId, input.type],
    );
    if (pref && pref.in_app === false) continue;
    await client.query(
      `SELECT create_notification($1, $2, $3, $4, $5, $6, $7)`,
      [input.organizationId, userId, input.type, input.title, input.body ?? "", input.ticketId ?? null, `${input.dedupeKey}:${userId}`],
    );
  }
}

export async function listNotifications(client: Sql, userId: string, organizationId: string) {
  const result = await client.query(
    `SELECT id, type, title, body, ticket_id, read_at, created_at
     FROM notifications
     WHERE user_id = $1 AND organization_id = $2
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId, organizationId],
  );
  return result.rows;
}

export async function markNotificationsRead(client: Sql, userId: string, organizationId: string, notificationId?: string) {
  if (notificationId) {
    await client.query(`UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND organization_id = $3`, [
      notificationId,
      userId,
      organizationId,
    ]);
    return;
  }
  await client.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND organization_id = $2 AND read_at IS NULL`, [userId, organizationId]);
}
