import "server-only";
import { AppError } from "@/lib/errors";
import { canExport } from "@/lib/permissions";
import { fillDailySeries } from "@/lib/time";
import type { Actor } from "@/lib/types";
import { one, rows, withAppUser } from "@/server/db";
import { listNotifications, markNotificationsRead } from "@/server/notifications";

function visibility(actor: Actor, params: unknown[], alias = "t"): string {
  params.push(actor.organizationId);
  let sql = `${alias}.organization_id = $${params.length}`;
  if (actor.role === "org_admin") return sql;
  params.push(actor.userId);
  const user = `$${params.length}`;
  params.push(actor.teamIds);
  sql += ` AND (${alias}.assigned_user_id = ${user} OR ${alias}.assigned_team_id = ANY($${params.length}::uuid[]))`;
  return sql;
}

export async function dashboard(actor: Actor, from: string, to: string) {
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const queueParams: unknown[] = [];
    const queueWhere = visibility(actor, queueParams);
    const queue = await one<{
      open_count: number;
      in_progress_count: number;
      pending_count: number;
      resolved_count: number;
      closed_count: number;
      unassigned_count: number;
    }>(
      client,
      `SELECT
         count(*) FILTER (WHERE status = 'open')::int AS open_count,
         count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
         count(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         count(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
         count(*) FILTER (WHERE status = 'closed')::int AS closed_count,
         count(*) FILTER (WHERE assigned_user_id IS NULL AND status NOT IN ('resolved','closed'))::int AS unassigned_count
       FROM tickets t WHERE ${queueWhere}`,
      queueParams,
    );
    const periodParams: unknown[] = [...queueParams, from, to, actor.timezone];
    const tz = `$${queueParams.length + 3}`;
    const periodWhere = `${queueWhere} AND (t.created_at AT TIME ZONE ${tz})::date >= $${queueParams.length + 1}::date AND (t.created_at AT TIME ZONE ${tz})::date <= $${queueParams.length + 2}::date`;
    const created = await one<{ count: number }>(client, `SELECT count(*)::int AS count FROM tickets t WHERE ${periodWhere}`, periodParams);
    const daily = await rows<{ day: string; count: number }>(
      client,
      `SELECT to_char((t.created_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
       FROM tickets t WHERE ${periodWhere} GROUP BY 1 ORDER BY 1`,
      periodParams,
    );
    const byPriority = await rows<{ priority: string; count: number }>(
      client,
      `SELECT priority, count(*)::int AS count FROM tickets t WHERE ${queueWhere} AND status NOT IN ('resolved','closed') GROUP BY priority`,
      queueParams,
    );
    const byCategory = await rows<{ name: string; count: number }>(
      client,
      `SELECT COALESCE(c.name, 'Uncategorized') AS name, count(*)::int AS count
       FROM tickets t LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${queueWhere} AND t.status NOT IN ('resolved','closed') GROUP BY 1 ORDER BY 2 DESC`,
      queueParams,
    );
    const byTeam = await rows<{ name: string; count: number }>(
      client,
      `SELECT COALESCE(tm.name, 'No team') AS name, count(*)::int AS count
       FROM tickets t LEFT JOIN teams tm ON tm.id = t.assigned_team_id
       WHERE ${queueWhere} AND t.status NOT IN ('resolved','closed') GROUP BY 1 ORDER BY 2 DESC`,
      queueParams,
    );
    const byAgent = await rows<{ name: string; count: number }>(
      client,
      `SELECT COALESCE(u.name, 'Unassigned') AS name, count(*)::int AS count
       FROM tickets t LEFT JOIN users u ON u.id = t.assigned_user_id
       WHERE ${queueWhere} AND t.status NOT IN ('resolved','closed') GROUP BY 1 ORDER BY 2 DESC`,
      queueParams,
    );
    const recent = await rows(
      client,
      `SELECT t.id, t.reference, t.subject, t.status, t.priority, t.last_activity_at
       FROM tickets t WHERE ${queueWhere} ORDER BY t.last_activity_at DESC LIMIT 8`,
      queueParams,
    );
    const mailboxes = actor.role === "org_admin"
      ? await rows(client, `SELECT id, email_address, provider, status, sync_status, last_success_at, last_error FROM mailboxes WHERE organization_id = $1`, [actor.organizationId])
      : [];
    const failedJobs = actor.role === "org_admin"
      ? await one<{ count: number }>(client, `SELECT count(*)::int AS count FROM background_jobs WHERE organization_id = $1 AND status = 'dead'`, [actor.organizationId])
      : { count: 0 };
    return {
      queue: queue ?? { open_count: 0, in_progress_count: 0, pending_count: 0, resolved_count: 0, closed_count: 0, unassigned_count: 0 },
      createdInPeriod: created?.count ?? 0,
      daily: fillDailySeries(from, to, daily),
      byPriority,
      byCategory,
      byTeam,
      byAgent,
      recent,
      mailboxes,
      failedJobs: failedJobs?.count ?? 0,
      from,
      to,
      timezone: actor.timezone,
    };
  });
}

export async function exportTickets(actor: Actor, from?: string, to?: string): Promise<string> {
  if (!canExport(actor.role)) throw new AppError("forbidden", "You do not have permission to export tickets.", 403);
  const rowsOut = await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const params: unknown[] = [];
    let where = visibility(actor, params);
    if (from && to) {
      params.push(from, to, actor.timezone);
      where += ` AND (t.created_at AT TIME ZONE $${params.length})::date >= $${params.length - 2}::date AND (t.created_at AT TIME ZONE $${params.length})::date <= $${params.length - 1}::date`;
    }
    const data = await rows<{
      reference: string;
      subject: string;
      status: string;
      priority: string;
      customer_email: string | null;
      customer_name: string | null;
      assignee_name: string | null;
      team_name: string | null;
      mailbox_email: string | null;
      created_at: Date;
      updated_at: Date;
      last_activity_at: Date;
      resolved_at: Date | null;
      closed_at: Date | null;
    }>(
      client,
      `SELECT t.reference, t.subject, t.status, t.priority, c.display_name AS customer_name,
              (SELECT email FROM customer_emails ce WHERE ce.customer_id = c.id ORDER BY is_primary DESC LIMIT 1) AS customer_email,
              u.name AS assignee_name, tm.name AS team_name, mb.email_address AS mailbox_email,
              t.created_at, t.updated_at, t.last_activity_at, t.resolved_at, t.closed_at
       FROM tickets t
       JOIN customers c ON c.id = t.customer_id
       LEFT JOIN users u ON u.id = t.assigned_user_id
       LEFT JOIN teams tm ON tm.id = t.assigned_team_id
       LEFT JOIN mailboxes mb ON mb.id = t.mailbox_id
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT 5000`,
      params,
    );
    await client.query(
      `INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, metadata) VALUES ($1, $2, 'tickets.exported', 'ticket', $3::jsonb)`,
      [actor.organizationId, actor.userId, JSON.stringify({ count: data.length })],
    );
    return data;
  });
  const header = ["reference", "subject", "status", "priority", "customer_email", "customer_name", "assignee", "team", "mailbox", "created_at", "updated_at", "last_activity_at", "resolved_at", "closed_at"];
  const lines = rowsOut.map((row) =>
    [row.reference, row.subject, row.status, row.priority, row.customer_email, row.customer_name, row.assignee_name, row.team_name, row.mailbox_email, row.created_at.toISOString(), row.updated_at.toISOString(), row.last_activity_at.toISOString(), row.resolved_at?.toISOString() ?? "", row.closed_at?.toISOString() ?? ""]
      .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export async function notificationsFor(actor: Actor) {
  return withAppUser(actor.userId, actor.organizationId, (client) => listNotifications(client, actor.userId, actor.organizationId));
}

export async function markRead(actor: Actor, notificationId?: string) {
  await withAppUser(actor.userId, actor.organizationId, (client) => markNotificationsRead(client, actor.userId, actor.organizationId, notificationId));
}

export async function unreadCount(actor: Actor): Promise<number> {
  const row = await withAppUser(actor.userId, actor.organizationId, (client) =>
    one<{ count: number }>(client, `SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND organization_id = $2 AND read_at IS NULL`, [actor.userId, actor.organizationId]),
  );
  return row?.count ?? 0;
}
