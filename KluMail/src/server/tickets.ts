import "server-only";
import { AppError } from "@/lib/errors";
import { isEmail, normalizeEmail } from "@/lib/email";
import { canAssignOthers, canBulkUpdate, canMergeTickets, canViewTicket } from "@/lib/permissions";
import { canTransition, nextTimestamps } from "@/lib/ticket-rules";
import type { Actor, Priority, TicketQuery, TicketStatus } from "@/lib/types";
import { PRIORITIES, TICKET_STATUSES } from "@/lib/types";
import { one, rows, withAppUser, type Sql } from "@/server/db";
import { assertActiveMember, recordAudit } from "@/server/actor";
import { notifyUsers } from "@/server/notifications";

type TicketRow = {
  id: string;
  organization_id: string;
  reference: string;
  customer_id: string;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  category_id: string | null;
  assigned_user_id: string | null;
  assigned_team_id: string | null;
  mailbox_id: string | null;
  source: string;
  provider_thread_id: string | null;
  resolution_note: string | null;
  merged_into_id: string | null;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
  customer_name?: string;
  customer_email?: string;
  assignee_name?: string | null;
  team_name?: string | null;
  mailbox_email?: string | null;
  mailbox_provider?: string | null;
};

function visibility(actor: Actor, params: unknown[], alias = "t"): string {
  params.push(actor.organizationId);
  let sql = `${alias}.organization_id = $${params.length}`;
  if (actor.role === "org_admin") return sql;
  params.push(actor.userId);
  const user = `$${params.length}`;
  params.push(actor.teamIds);
  const teams = `$${params.length}`;
  sql += ` AND (${alias}.assigned_user_id = ${user} OR ${alias}.assigned_team_id = ANY(${teams}::uuid[]))`;
  return sql;
}

function viewSql(actor: Actor, query: TicketQuery, params: unknown[]): string {
  switch (query.view) {
    case "mine":
      params.push(actor.userId);
      return `t.assigned_user_id = $${params.length} AND t.status NOT IN ('resolved','closed')`;
    case "mine_open":
      params.push(actor.userId);
      return `t.assigned_user_id = $${params.length} AND t.status = 'open'`;
    case "mine_pending":
      params.push(actor.userId);
      return `t.assigned_user_id = $${params.length} AND t.status = 'pending'`;
    case "team":
      params.push(actor.teamIds);
      return `t.assigned_team_id = ANY($${params.length}::uuid[]) AND t.status NOT IN ('resolved','closed')`;
    case "unassigned":
      return `t.assigned_user_id IS NULL AND t.status NOT IN ('resolved','closed')`;
    case "resolved_recent":
      return `t.status IN ('resolved','closed') AND t.last_activity_at > now() - interval '7 days'`;
    case "updated_recent":
      return `t.last_activity_at > now() - interval '48 hours'`;
    default:
      return "TRUE";
  }
}

function orderSql(query: TicketQuery): string {
  const direction = query.direction === "asc" ? "ASC" : "DESC";
  if (query.sort === "priority") {
    return `CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END ${direction}, t.last_activity_at DESC`;
  }
  const column = query.sort === "created_at" || query.sort === "status" ? query.sort : "last_activity_at";
  return `t.${column} ${direction}`;
}

const TICKET_SELECT = `
  SELECT t.*, c.display_name AS customer_name,
         (SELECT ce.email FROM customer_emails ce WHERE ce.customer_id = c.id AND ce.organization_id = t.organization_id ORDER BY ce.is_primary DESC, ce.created_at LIMIT 1) AS customer_email,
         u.name AS assignee_name, tm.name AS team_name, mb.email_address AS mailbox_email, mb.provider AS mailbox_provider
  FROM tickets t
  JOIN customers c ON c.id = t.customer_id AND c.organization_id = t.organization_id
  LEFT JOIN users u ON u.id = t.assigned_user_id
  LEFT JOIN teams tm ON tm.id = t.assigned_team_id AND tm.organization_id = t.organization_id
  LEFT JOIN mailboxes mb ON mb.id = t.mailbox_id AND mb.organization_id = t.organization_id
`;

function filterSql(actor: Actor, query: TicketQuery, params: unknown[]): string {
  const clauses = [visibility(actor, params), viewSql(actor, query, params)];
  if (query.status.length) {
    params.push(query.status);
    clauses.push(`t.status = ANY($${params.length}::text[])`);
  }
  if (query.priority.length) {
    params.push(query.priority);
    clauses.push(`t.priority = ANY($${params.length}::text[])`);
  }
  if (query.assigneeId) {
    params.push(query.assigneeId);
    clauses.push(`t.assigned_user_id = $${params.length}`);
  }
  if (query.teamId) {
    params.push(query.teamId);
    clauses.push(`t.assigned_team_id = $${params.length}`);
  }
  if (query.mailboxId) {
    params.push(query.mailboxId);
    clauses.push(`t.mailbox_id = $${params.length}`);
  }
  if (query.categoryId) {
    params.push(query.categoryId);
    clauses.push(`t.category_id = $${params.length}`);
  }
  if (query.tagId) {
    params.push(query.tagId);
    clauses.push(`EXISTS (SELECT 1 FROM ticket_tags tt WHERE tt.ticket_id = t.id AND tt.tag_id = $${params.length})`);
  }
  if (query.from) {
    params.push(query.from, actor.timezone);
    clauses.push(`(t.created_at AT TIME ZONE $${params.length})::date >= $${params.length - 1}::date`);
  }
  if (query.to) {
    params.push(query.to, actor.timezone);
    clauses.push(`(t.created_at AT TIME ZONE $${params.length})::date <= $${params.length - 1}::date`);
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    const like = `$${params.length}`;
    params.push(query.q);
    const text = `$${params.length}`;
    clauses.push(`(
      t.reference ILIKE ${like} OR t.subject ILIKE ${like}
      OR EXISTS (SELECT 1 FROM customer_emails ce WHERE ce.customer_id = t.customer_id AND ce.organization_id = t.organization_id AND ce.email ILIKE ${like})
      OR EXISTS (SELECT 1 FROM customers c2 WHERE c2.id = t.customer_id AND c2.display_name ILIKE ${like})
      OR t.search_vector @@ plainto_tsquery('english', ${text})
      OR EXISTS (SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.organization_id = t.organization_id AND m.search_vector @@ plainto_tsquery('english', ${text}))
    )`);
  }
  return clauses.join(" AND ");
}

export async function listTickets(actor: Actor, query: TicketQuery) {
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const params: unknown[] = [];
    const where = filterSql(actor, query, params);
    const count = await one<{ count: string }>(client, `SELECT count(*)::text AS count FROM tickets t WHERE ${where}`, params);
    const offset = (query.page - 1) * query.pageSize;
    const listParams = [...params, query.pageSize, offset];
    const items = await rows<TicketRow>(
      client,
      `${TICKET_SELECT} WHERE ${where} ORDER BY ${orderSql(query)} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams,
    );
    return { items, total: Number(count?.count ?? "0"), page: query.page, pageSize: query.pageSize };
  });
}

export async function getTicket(actor: Actor, ticketId: string) {
  return withAppUser(actor.userId, actor.organizationId, async (client) => loadTicket(client, actor, ticketId));
}

async function loadTicket(client: Sql, actor: Actor, ticketId: string): Promise<TicketRow> {
  const params: unknown[] = [ticketId];
  const where = `t.id = $1 AND ${visibility(actor, params)}`;
  const ticket = await one<TicketRow>(client, `${TICKET_SELECT} WHERE ${where}`, params);
  if (!ticket || !canViewTicket(actor.role, actor.userId, actor.teamIds, actor.organizationId, {
    organizationId: ticket.organization_id,
    assignedUserId: ticket.assigned_user_id,
    assignedTeamId: ticket.assigned_team_id,
  })) {
    throw new AppError("not_found", "That ticket was not found.", 404);
  }
  return ticket;
}

export async function ticketDetail(actor: Actor, ticketId: string) {
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const ticket = await loadTicket(client, actor, ticketId);
    const messages = await rows(
      client,
      `SELECT id, kind, delivery_status, author_user_id, from_email, from_name, to_emails, cc_emails, subject,
              body_text, body_html, provider_message_id, provider_accepted_at, send_error, occurred_at, created_at
       FROM messages
       WHERE organization_id = $1 AND (ticket_id = $2 OR ticket_id IN (
         SELECT ticket_id FROM ticket_links WHERE related_ticket_id = $2 AND link_type = 'merged_from' AND organization_id = $1
       ))
       ORDER BY occurred_at ASC, created_at ASC`,
      [actor.organizationId, ticketId],
    );
    const events = await rows(
      client,
      `SELECT id, event_type, payload, actor_user_id, created_at FROM ticket_events
       WHERE organization_id = $1 AND ticket_id = $2 ORDER BY created_at ASC`,
      [actor.organizationId, ticketId],
    );
    const tags = await rows(
      client,
      `SELECT tg.id, tg.name, tg.color FROM ticket_tags tt JOIN tags tg ON tg.id = tt.tag_id
       WHERE tt.ticket_id = $1 AND tt.organization_id = $2`,
      [ticketId, actor.organizationId],
    );
    const links = await rows(
      client,
      `SELECT l.link_type, t.id, t.reference, t.subject, t.status
       FROM ticket_links l JOIN tickets t ON t.id = l.related_ticket_id
       WHERE l.ticket_id = $1 AND l.organization_id = $2`,
      [ticketId, actor.organizationId],
    );
    const duplicates = await rows(
      client,
      `SELECT id, reference, subject, status FROM tickets
       WHERE organization_id = $1 AND customer_id = $2 AND id <> $3
         AND lower(subject) = lower($4) AND created_at > now() - interval '14 days'
       LIMIT 5`,
      [actor.organizationId, ticket.customer_id, ticket.id, ticket.subject],
    );
    const attachments = await rows(
      client,
      `SELECT a.id, a.filename, a.content_type, a.size_bytes, a.message_id
       FROM attachments a WHERE a.organization_id = $1 AND a.ticket_id = $2`,
      [actor.organizationId, ticketId],
    );
    return { ticket, messages, events, tags, links, duplicates, attachments };
  });
}

async function touch(client: Sql, ticketId: string) {
  await client.query(`UPDATE tickets SET last_activity_at = now() WHERE id = $1`, [ticketId]);
}

async function event(client: Sql, actor: Actor, ticketId: string, eventType: string, payload: Record<string, unknown>) {
  const row = await one<{ id: string }>(
    client,
    `INSERT INTO ticket_events (organization_id, ticket_id, actor_user_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
    [actor.organizationId, ticketId, actor.userId, eventType, JSON.stringify(payload)],
  );
  return row?.id ?? ticketId;
}

export async function createManualTicket(actor: Actor, input: { subject: string; customerEmail: string; customerName?: string; body: string; teamId?: string | null; priority?: Priority }) {
  const email = normalizeEmail(input.customerEmail);
  if (!isEmail(email)) throw new AppError("validation_error", "Enter the customer's email address.", 400);
  const subject = input.subject.trim();
  if (subject.length < 2) throw new AppError("validation_error", "Enter a subject.", 400);
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    if (input.teamId && actor.role !== "org_admin" && !actor.teamIds.includes(input.teamId)) {
      throw new AppError("forbidden", "You cannot open a ticket for that team.", 403);
    }
    const customerId = await upsertCustomer(client, actor.organizationId, email, input.customerName?.trim() || email);
    const reference = await one<{ next_ticket_reference: string }>(client, "SELECT next_ticket_reference($1)", [actor.organizationId]);
    const ticket = await one<{ id: string }>(
      client,
      `INSERT INTO tickets (organization_id, reference, customer_id, subject, status, priority, assigned_team_id, source)
       VALUES ($1, $2, $3, $4, 'open', $5, $6, 'manual') RETURNING id`,
      [actor.organizationId, reference?.next_ticket_reference, customerId, subject, input.priority ?? actor.defaultPriority, input.teamId ?? actor.teamIds[0] ?? null],
    );
    if (!ticket) throw new AppError("internal_error", "Could not create the ticket.", 500);
    await client.query(
      `INSERT INTO messages (organization_id, ticket_id, kind, delivery_status, author_user_id, body_text, subject, occurred_at)
       VALUES ($1, $2, 'internal_note', 'internal', $3, $4, $5, now())`,
      [actor.organizationId, ticket.id, actor.userId, input.body.trim(), subject],
    );
    await event(client, actor, ticket.id, "created", { source: "manual" });
    await client.query(
      `INSERT INTO domain_events (organization_id, event_type, payload) VALUES ($1, 'ticket.created', $2::jsonb)`,
      [actor.organizationId, JSON.stringify({ ticketId: ticket.id, source: "manual" })],
    );
    return { id: ticket.id, reference: reference?.next_ticket_reference };
  });
}

export async function upsertCustomer(client: Sql, organizationId: string, email: string, name: string): Promise<string> {
  const normalized = normalizeEmail(email);
  const existing = await one<{ customer_id: string }>(
    client,
    `SELECT customer_id FROM customer_emails WHERE organization_id = $1 AND lower(email) = $2`,
    [organizationId, normalized],
  );
  if (existing) return existing.customer_id;
  const customer = await one<{ id: string }>(
    client,
    `INSERT INTO customers (organization_id, display_name) VALUES ($1, $2) RETURNING id`,
    [organizationId, name || normalized],
  );
  if (!customer) throw new AppError("internal_error", "Could not create the customer.", 500);
  try {
    await client.query(
      `INSERT INTO customer_emails (organization_id, customer_id, email, is_primary) VALUES ($1, $2, $3, true)`,
      [organizationId, customer.id, normalized],
    );
  } catch (error) {
    const raced = await one<{ customer_id: string }>(
      client,
      `SELECT customer_id FROM customer_emails WHERE organization_id = $1 AND lower(email) = $2`,
      [organizationId, normalized],
    );
    if (raced) return raced.customer_id;
    throw error;
  }
  return customer.id;
}

export async function updateTicketStatus(actor: Actor, ticketId: string, status: TicketStatus, resolutionNote?: string) {
  if (!TICKET_STATUSES.includes(status)) throw new AppError("validation_error", "Choose a valid status.", 400);
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const ticket = await loadTicket(client, actor, ticketId);
    if (!canTransition(ticket.status, status)) {
      throw new AppError("invalid_transition", `A ${ticket.status.replaceAll("_", " ")} ticket cannot move to ${status.replaceAll("_", " ")}.`, 409);
    }
    const stamps = nextTimestamps(ticket.status, status, new Date(), { resolvedAt: ticket.resolved_at, closedAt: ticket.closed_at });
    await client.query(
      `UPDATE tickets SET status = $2, resolution_note = COALESCE($3, resolution_note), resolved_at = $4, closed_at = $5, last_activity_at = now()
       WHERE id = $1`,
      [ticketId, status, resolutionNote ?? null, stamps.resolvedAt, stamps.closedAt],
    );
    const eventId = await event(client, actor, ticketId, status === "open" && ticket.status !== "open" ? "reopened" : "status_changed", {
      from: ticket.status,
      to: status,
      resolutionNote: resolutionNote ?? null,
    });
    if (ticket.assigned_user_id) {
      await notifyUsers(client, {
        organizationId: actor.organizationId,
        userIds: [ticket.assigned_user_id],
        actorUserId: actor.userId,
        type: "status_changed",
        title: `${ticket.reference} is now ${status.replaceAll("_", " ")}`,
        ticketId,
        dedupeKey: `status:${ticketId}:${eventId}`,
      });
    }
    return { status };
  });
}

export async function updateTicketFields(actor: Actor, ticketId: string, input: { priority?: Priority; categoryId?: string | null }) {
  if (input.priority && !PRIORITIES.includes(input.priority)) throw new AppError("validation_error", "Choose a valid priority.", 400);
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const ticket = await loadTicket(client, actor, ticketId);
    if (input.categoryId) {
      const category = await one(client, `SELECT id FROM categories WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL`, [input.categoryId, actor.organizationId]);
      if (!category) throw new AppError("invalid_reference", "That category is not available.", 400);
    }
    await client.query(
      `UPDATE tickets SET priority = COALESCE($2, priority), category_id = COALESCE($3, category_id), last_activity_at = now() WHERE id = $1`,
      [ticketId, input.priority ?? null, input.categoryId === undefined ? null : input.categoryId],
    );
    if (input.categoryId === null) {
      await client.query(`UPDATE tickets SET category_id = NULL WHERE id = $1`, [ticketId]);
    }
    await event(client, actor, ticketId, "fields_changed", { priority: input.priority ?? ticket.priority, categoryId: input.categoryId ?? ticket.category_id });
    await touch(client, ticketId);
  });
}

export async function assignTicket(actor: Actor, ticketId: string, input: { assigneeId?: string | null; teamId?: string | null }) {
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const ticket = await loadTicket(client, actor, ticketId);
    const assigneeId = input.assigneeId === undefined ? ticket.assigned_user_id : input.assigneeId;
    const teamId = input.teamId === undefined ? ticket.assigned_team_id : input.teamId;
    if (actor.role === "agent") {
      if (teamId !== ticket.assigned_team_id) throw new AppError("forbidden", "Agents cannot transfer a ticket to another team.", 403);
      if (assigneeId && assigneeId !== actor.userId) throw new AppError("forbidden", "Agents can only claim a ticket for themselves.", 403);
      if (assigneeId === actor.userId && ticket.assigned_user_id && ticket.assigned_user_id !== actor.userId) {
        throw new AppError("forbidden", "This ticket is already assigned.", 403);
      }
    } else if (!canAssignOthers(actor.role)) {
      throw new AppError("forbidden", "You cannot assign this ticket.", 403);
    }
    if (actor.role === "manager") {
      if (teamId && !actor.teamIds.includes(teamId)) throw new AppError("forbidden", "You can only assign tickets within your teams.", 403);
      if (assigneeId) {
        const shared = await one(
          client,
          `SELECT 1 FROM team_memberships WHERE organization_id = $1 AND user_id = $2 AND team_id = ANY($3::uuid[])`,
          [actor.organizationId, assigneeId, actor.teamIds],
        );
        if (!shared && assigneeId !== actor.userId) throw new AppError("forbidden", "You can only assign tickets to members of your teams.", 403);
      }
    }
    if (assigneeId) await assertActiveMember(client, actor.organizationId, assigneeId);
    if (teamId) {
      const team = await one(client, `SELECT id FROM teams WHERE id = $1 AND organization_id = $2`, [teamId, actor.organizationId]);
      if (!team) throw new AppError("invalid_reference", "That team is not in this organization.", 400);
    }
    await client.query(`UPDATE tickets SET assigned_user_id = $2, assigned_team_id = $3, last_activity_at = now() WHERE id = $1`, [ticketId, assigneeId, teamId]);
    const eventId = await event(client, actor, ticketId, "assigned", {
      fromUser: ticket.assigned_user_id,
      toUser: assigneeId,
      fromTeam: ticket.assigned_team_id,
      toTeam: teamId,
    });
    if (assigneeId) {
      await notifyUsers(client, {
        organizationId: actor.organizationId,
        userIds: [assigneeId],
        actorUserId: actor.userId,
        type: ticket.assigned_user_id && ticket.assigned_user_id !== assigneeId ? "ticket_reassigned" : "ticket_assigned",
        title: `${ticket.reference} was assigned to you`,
        ticketId,
        dedupeKey: `assign:${ticketId}:${eventId}`,
      });
    }
  });
}

export async function setTicketTag(actor: Actor, ticketId: string, tagId: string, enabled: boolean) {
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    await loadTicket(client, actor, ticketId);
    const tag = await one(client, `SELECT id FROM tags WHERE id = $1 AND organization_id = $2`, [tagId, actor.organizationId]);
    if (!tag) throw new AppError("invalid_reference", "That tag is not available.", 400);
    if (enabled) {
      await client.query(
        `INSERT INTO ticket_tags (ticket_id, tag_id, organization_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [ticketId, tagId, actor.organizationId],
      );
    } else {
      await client.query(`DELETE FROM ticket_tags WHERE ticket_id = $1 AND tag_id = $2 AND organization_id = $3`, [ticketId, tagId, actor.organizationId]);
    }
    await event(client, actor, ticketId, enabled ? "tagged" : "untagged", { tagId });
    await touch(client, ticketId);
  });
}

export async function linkTickets(actor: Actor, ticketId: string, relatedTicketId: string, linkType: "related" | "duplicate") {
  if (ticketId === relatedTicketId) throw new AppError("validation_error", "Choose a different ticket.", 400);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    await loadTicket(client, actor, ticketId);
    await loadTicket(client, actor, relatedTicketId);
    await client.query(
      `INSERT INTO ticket_links (organization_id, ticket_id, related_ticket_id, link_type, created_by)
       VALUES ($1, $2, $3, $4, $5), ($1, $3, $2, $4, $5)
       ON CONFLICT DO NOTHING`,
      [actor.organizationId, ticketId, relatedTicketId, linkType, actor.userId],
    );
    await event(client, actor, ticketId, "linked", { relatedTicketId, linkType });
  });
}

export async function mergeTickets(actor: Actor, targetId: string, sourceId: string) {
  if (!canMergeTickets(actor.role)) throw new AppError("forbidden", "You cannot merge tickets.", 403);
  if (targetId === sourceId) throw new AppError("validation_error", "Choose a different ticket.", 400);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const target = await loadTicket(client, actor, targetId);
    const source = await loadTicket(client, actor, sourceId);
    await client.query(`UPDATE tickets SET status = 'closed', closed_at = COALESCE(closed_at, now()), merged_into_id = $2, last_activity_at = now() WHERE id = $1`, [sourceId, targetId]);
    await client.query(
      `INSERT INTO ticket_links (organization_id, ticket_id, related_ticket_id, link_type, created_by)
       VALUES ($1, $2, $3, 'merged_into', $4), ($1, $3, $2, 'merged_from', $4)
       ON CONFLICT DO NOTHING`,
      [actor.organizationId, sourceId, targetId, actor.userId],
    );
    await event(client, actor, sourceId, "merged", { into: target.reference });
    await event(client, actor, targetId, "merged", { from: source.reference });
    await recordAudit(client, actor, "ticket.merged", "ticket", targetId, { sourceId });
  });
}

export async function bulkUpdate(actor: Actor, input: { ticketIds: string[]; status?: TicketStatus; assigneeId?: string | null; teamId?: string | null }) {
  if (!canBulkUpdate(actor.role)) throw new AppError("forbidden", "You cannot update tickets in bulk.", 403);
  if (input.ticketIds.length > 50) throw new AppError("validation_error", "Bulk actions are limited to 50 tickets.", 400);
  const updated: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const ticketId of input.ticketIds) {
    try {
      if (input.status) await updateTicketStatus(actor, ticketId, input.status);
      if (input.assigneeId !== undefined || input.teamId !== undefined) {
        await assignTicket(actor, ticketId, { assigneeId: input.assigneeId, teamId: input.teamId });
      }
      updated.push(ticketId);
    } catch (error) {
      failed.push({ id: ticketId, message: error instanceof AppError ? error.message : "Could not update that ticket." });
    }
  }
  return { updated, failed };
}

export async function searchCustomers(actor: Actor, q: string) {
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    rows(
      client,
      `SELECT c.id, c.display_name, ce.email, c.created_at
       FROM customers c
       JOIN customer_emails ce ON ce.customer_id = c.id AND ce.organization_id = c.organization_id
       WHERE c.organization_id = $1 AND (c.display_name ILIKE $2 OR ce.email ILIKE $2)
       ORDER BY c.display_name LIMIT 25`,
      [actor.organizationId, `%${q}%`],
    ),
  );
}

export async function getCustomer(actor: Actor, customerId: string) {
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const customer = await one<{ id: string; display_name: string; created_at: Date }>(
      client,
      `SELECT id, display_name, created_at FROM customers WHERE id = $1 AND organization_id = $2`,
      [customerId, actor.organizationId],
    );
    if (!customer) throw new AppError("not_found", "That customer was not found.", 404);
    const emails = await rows(client, `SELECT id, email, is_primary FROM customer_emails WHERE customer_id = $1 AND organization_id = $2`, [customerId, actor.organizationId]);
    const params: unknown[] = [];
    const where = `${visibility(actor, params)} AND t.customer_id = $${params.length + 1}`;
    params.push(customerId);
    const tickets = await rows(client, `${TICKET_SELECT} WHERE ${where} ORDER BY t.last_activity_at DESC LIMIT 50`, params);
    const similar = await rows(
      client,
      `SELECT id, display_name FROM customers WHERE organization_id = $1 AND id <> $2 AND lower(display_name) = lower($3) LIMIT 5`,
      [actor.organizationId, customerId, customer.display_name],
    );
    return { customer, emails, tickets, similar };
  });
}

export async function updateCustomer(actor: Actor, customerId: string, displayName: string) {
  const name = displayName.trim();
  if (name.length < 2) throw new AppError("validation_error", "Enter the customer's name.", 400);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const row = await one(client, `UPDATE customers SET display_name = $3 WHERE id = $1 AND organization_id = $2 RETURNING id`, [customerId, actor.organizationId, name]);
    if (!row) throw new AppError("not_found", "That customer was not found.", 404);
    await recordAudit(client, actor, "customer.updated", "customer", customerId, {});
  });
}

export async function mergeCustomers(actor: Actor, targetId: string, sourceId: string) {
  if (actor.role !== "org_admin") throw new AppError("forbidden", "Only an organization administrator can merge customers.", 403);
  if (targetId === sourceId) throw new AppError("validation_error", "Choose a different customer.", 400);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const sourceEmails = await rows<{ email: string }>(client, `SELECT email FROM customer_emails WHERE customer_id = $1 AND organization_id = $2`, [sourceId, actor.organizationId]);
    for (const email of sourceEmails) {
      await client.query(`DELETE FROM customer_emails WHERE customer_id = $1 AND organization_id = $2 AND lower(email) = $3`, [sourceId, actor.organizationId, email.email]);
      await client.query(
        `INSERT INTO customer_emails (organization_id, customer_id, email, is_primary) VALUES ($1, $2, $3, false) ON CONFLICT DO NOTHING`,
        [actor.organizationId, targetId, email.email],
      );
    }
    await client.query(`UPDATE tickets SET customer_id = $3 WHERE customer_id = $1 AND organization_id = $2`, [sourceId, actor.organizationId, targetId]);
    await client.query(`DELETE FROM customers WHERE id = $1 AND organization_id = $2`, [sourceId, actor.organizationId]);
    await recordAudit(client, actor, "customer.merged", "customer", targetId, { sourceId });
  });
}

export { loadTicket };
