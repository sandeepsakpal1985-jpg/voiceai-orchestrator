import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/errors";
import { attachmentAllowed, isEmail, normalizeEmail, safeFilename } from "@/lib/email";
import { sanitizeEmailHtml } from "@/lib/html";
import { parseMentions } from "@/lib/mentions";
import type { Actor } from "@/lib/types";
import { one, rows, withAppUser } from "@/server/db";
import { userByEmail } from "@/server/actor";
import { loadTicket } from "@/server/tickets";
import { notifyUsers } from "@/server/notifications";
import { enqueueJob, kickJobs } from "@/server/jobs";

function signatureFor(actor: Actor, body: string): string {
  const signature = actor.emailSignature || actor.defaultSignature;
  if (!signature || body.includes(signature)) return body;
  return `${body.trim()}\n\n${signature}`;
}

async function mailboxForTicket(client: Parameters<typeof one>[0], actor: Actor, mailboxId: string | null) {
  if (!mailboxId) throw new AppError("mailbox_required", "Connect a mailbox before replying to the customer.", 409);
  const mailbox = await one<{ id: string; email_address: string; status: string; provider: string }>(
    client,
    `SELECT id, email_address, status, provider FROM mailboxes WHERE id = $1 AND organization_id = $2`,
    [mailboxId, actor.organizationId],
  );
  if (!mailbox || mailbox.status !== "connected") throw new AppError("mailbox_required", "The mailbox for this ticket is not connected.", 409);
  return mailbox;
}

export async function addInternalNote(actor: Actor, ticketId: string, body: string) {
  const text = body.trim();
  if (text.length < 1) throw new AppError("validation_error", "Write a note before saving it.", 400);
  const result = await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const ticket = await loadTicket(client, actor, ticketId);
    const message = await one<{ id: string }>(
      client,
      `INSERT INTO messages (organization_id, ticket_id, kind, delivery_status, author_user_id, body_text, subject, occurred_at)
       VALUES ($1, $2, 'internal_note', 'internal', $3, $4, $5, now()) RETURNING id`,
      [actor.organizationId, ticketId, actor.userId, text, ticket.subject],
    );
    if (!message) throw new AppError("internal_error", "Could not save the note.", 500);
    const mentions = parseMentions(text);
    const mentioned: string[] = [...mentions.userIds];
    for (const email of mentions.emails) {
      const id = await userByEmail(client, actor.organizationId, email);
      if (id) mentioned.push(id);
    }
    await notifyUsers(client, {
      organizationId: actor.organizationId,
      userIds: mentioned,
      actorUserId: actor.userId,
      type: "mention",
      title: `${actor.name} mentioned you on ${ticket.reference}`,
      body: text.slice(0, 180),
      ticketId,
      dedupeKey: `mention:${message.id}`,
    });
    await client.query(`INSERT INTO ticket_events (organization_id, ticket_id, actor_user_id, event_type, payload) VALUES ($1, $2, $3, 'note_added', $4::jsonb)`, [
      actor.organizationId,
      ticketId,
      actor.userId,
      JSON.stringify({ messageId: message.id }),
    ]);
    await client.query(`UPDATE tickets SET last_activity_at = now() WHERE id = $1`, [ticketId]);
    return { id: message.id };
  });
  return result;
}

export async function queueReply(
  actor: Actor,
  ticketId: string,
  input: { to: string[]; cc?: string[]; subject?: string; body: string; clientRequestId?: string; forward?: boolean },
) {
  const to = input.to.map(normalizeEmail).filter(isEmail);
  const cc = (input.cc ?? []).map(normalizeEmail).filter(isEmail);
  if (!to.length) throw new AppError("validation_error", "Add at least one recipient.", 400);
  const body = signatureFor(actor, input.body);
  if (!body.trim()) throw new AppError("validation_error", "Write a message before sending it.", 400);
  const queued = await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const ticket = await loadTicket(client, actor, ticketId);
    if (ticket.status === "closed") throw new AppError("invalid_transition", "Reopen this ticket before sending another reply.", 409);
    if (ticket.status === "resolved") {
      await client.query(`UPDATE tickets SET status = 'open', resolved_at = NULL, closed_at = NULL WHERE id = $1`, [ticketId]);
    }
    const mailbox = await mailboxForTicket(client, actor, ticket.mailbox_id);
    if (input.clientRequestId) {
      const existing = await one<{ id: string; delivery_status: string }>(
        client,
        `SELECT id, delivery_status FROM messages WHERE organization_id = $1 AND client_request_id = $2`,
        [actor.organizationId, input.clientRequestId],
      );
      if (existing) return existing;
    }
    const latest = await one<{ message_id_header: string | null; references_header: string | null }>(
      client,
      `SELECT message_id_header, references_header FROM messages
       WHERE ticket_id = $1 AND message_id_header IS NOT NULL ORDER BY occurred_at DESC LIMIT 1`,
      [ticketId],
    );
    const subject = input.subject?.trim() || (input.forward ? `Fwd: ${ticket.subject}` : ticket.subject.startsWith("Re:") ? ticket.subject : `Re: ${ticket.subject}`);
    const message = await one<{ id: string; delivery_status: string }>(
      client,
      `INSERT INTO messages (
        organization_id, ticket_id, mailbox_id, kind, delivery_status, author_user_id, from_email, from_name,
        to_emails, cc_emails, subject, body_text, body_html, provider_thread_id, in_reply_to, references_header, client_request_id, occurred_at
      ) VALUES (
        $1,$2,$3,'outbound','queued',$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15, now()
      ) RETURNING id, delivery_status`,
      [
        actor.organizationId,
        ticketId,
        mailbox.id,
        actor.userId,
        mailbox.email_address,
        actor.name,
        JSON.stringify(to.map((email) => ({ email }))),
        JSON.stringify(cc.map((email) => ({ email }))),
        subject,
        body,
        sanitizeEmailHtml(body.replace(/\n/g, "<br>")),
        ticket.provider_thread_id,
        latest?.message_id_header ?? null,
        latest?.message_id_header ? `${latest.references_header ?? ""} ${latest.message_id_header}`.trim() : null,
        input.clientRequestId ?? null,
      ],
    );
    if (!message) throw new AppError("internal_error", "Could not queue the reply.", 500);
    await enqueueJob(client, {
      organizationId: actor.organizationId,
      type: "message.send",
      payload: { messageId: message.id },
      dedupeKey: `send:${message.id}`,
    });
    await client.query(`UPDATE tickets SET last_activity_at = now(), status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END WHERE id = $1`, [ticketId]);
    return message;
  });
  await kickJobs();
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    one<{ id: string; delivery_status: string; send_error: string | null; provider_accepted_at: Date | null }>(
      client,
      `SELECT id, delivery_status, send_error, provider_accepted_at FROM messages WHERE id = $1 AND organization_id = $2`,
      [queued.id, actor.organizationId],
    ),
  );
}

export async function saveDraft(actor: Actor, ticketId: string, input: { draftId?: string; to: string[]; cc?: string[]; subject?: string; body: string }) {
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const ticket = await loadTicket(client, actor, ticketId);
    if (input.draftId) {
      const updated = await one(
        client,
        `UPDATE messages SET body_text = $3, subject = $4, to_emails = $5::jsonb, cc_emails = $6::jsonb
         WHERE id = $1 AND organization_id = $2 AND delivery_status = 'draft' AND author_user_id = $7
         RETURNING id`,
        [input.draftId, actor.organizationId, input.body, input.subject ?? ticket.subject, JSON.stringify(input.to), JSON.stringify(input.cc ?? []), actor.userId],
      );
      if (!updated) throw new AppError("not_found", "That draft was not found.", 404);
      return updated;
    }
    return one(
      client,
      `INSERT INTO messages (organization_id, ticket_id, mailbox_id, kind, delivery_status, author_user_id, subject, body_text, to_emails, cc_emails)
       VALUES ($1, $2, $3, 'outbound', 'draft', $4, $5, $6, $7::jsonb, $8::jsonb) RETURNING id`,
      [actor.organizationId, ticketId, ticket.mailbox_id, actor.userId, input.subject ?? ticket.subject, input.body, JSON.stringify(input.to), JSON.stringify(input.cc ?? [])],
    );
  });
}

export async function readAttachment(actor: Actor, attachmentId: string) {
  const row = await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const attachment = await one<{ id: string; ticket_id: string; filename: string; content_type: string; storage_key: string }>(
      client,
      `SELECT id, ticket_id, filename, content_type, storage_key FROM attachments WHERE id = $1 AND organization_id = $2`,
      [attachmentId, actor.organizationId],
    );
    if (!attachment) return null;
    await loadTicket(client, actor, attachment.ticket_id);
    return attachment;
  });
  if (!row || row.storage_key.includes("..") || row.storage_key.includes("/") || row.storage_key.includes("\\")) {
    throw new AppError("not_found", "That attachment was not found.", 404);
  }
  if (!attachmentAllowed(row.filename)) throw new AppError("forbidden", "This attachment type cannot be downloaded.", 403);
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), "data", "attachments", actor.organizationId, row.storage_key));
    return { filename: safeFilename(row.filename), contentType: row.content_type || "application/octet-stream", bytes };
  } catch {
    throw new AppError("not_found", "That attachment was not found.", 404);
  }
}

export async function savedViews(actor: Actor) {
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    rows(client, `SELECT id, name, query FROM saved_views WHERE organization_id = $1 AND user_id = $2 ORDER BY name`, [actor.organizationId, actor.userId]),
  );
}

export async function saveView(actor: Actor, name: string, query: unknown) {
  const clean = name.trim();
  if (clean.length < 2) throw new AppError("validation_error", "Name the view.", 400);
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    one(
      client,
      `INSERT INTO saved_views (organization_id, user_id, name, query) VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (organization_id, user_id, name) DO UPDATE SET query = EXCLUDED.query RETURNING id`,
      [actor.organizationId, actor.userId, clean, JSON.stringify(query)],
    ),
  );
}
