import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/errors";
import { attachmentAllowed, normalizeEmail, safeFilename } from "@/lib/email";
import { sanitizeEmailHtml } from "@/lib/html";
import { decryptString, encryptString } from "@/lib/crypto";
import { decideThread, referencedMessageIds, shouldSkipIngestion } from "@/lib/threading";
import type { ProviderId } from "@/lib/types";
import { one, withWorkerOrg, type Sql } from "@/server/db";
import { notifyUsers } from "@/server/notifications";
import { upsertCustomer } from "@/server/tickets";
import {
  findSentMessage,
  listProviderMessages,
  ProviderAuthError,
  refreshTokens,
  renewSubscription,
  sendProviderMessage,
  type OutboundDraft,
  type ProviderMessage,
  type TokenSet,
} from "@/server/providers";

type MailboxRow = {
  id: string;
  organization_id: string;
  team_id: string | null;
  provider: ProviderId;
  email_address: string;
  display_name: string;
  status: string;
};

function encryptionKey(): string {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) throw new Error("APP_ENCRYPTION_KEY is not set");
  return key;
}

export async function loadTokens(client: Sql, mailboxId: string, provider: ProviderId): Promise<TokenSet> {
  const row = await one<{ access_token_ciphertext: string; refresh_token_ciphertext: string | null; token_expires_at: Date | null; scopes: string }>(
    client,
    `SELECT access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes FROM mailbox_credentials WHERE mailbox_id = $1`,
    [mailboxId],
  );
  if (!row) throw new ProviderAuthError("This mailbox has no saved authorization.");
  const refreshToken = row.refresh_token_ciphertext ? decryptString(row.refresh_token_ciphertext, encryptionKey()) : undefined;
  const expiresAt = row.token_expires_at?.getTime() ?? 0;
  if (refreshToken && expiresAt < Date.now() + 60_000) {
    const next = await refreshTokens(provider, refreshToken);
    if (provider === "mock") {
      await client.query("UPDATE mock_mailbox_controls SET token_refresh_count = token_refresh_count + 1 WHERE mailbox_id = $1", [mailboxId]);
    }
    await saveTokens(client, mailboxId, next.refreshToken ? next : { ...next, refreshToken });
    return next.refreshToken ? next : { ...next, refreshToken };
  }
  return {
    accessToken: decryptString(row.access_token_ciphertext, encryptionKey()),
    refreshToken,
    expiresAt: row.token_expires_at?.toISOString(),
    scopes: row.scopes,
  };
}

export async function saveTokens(client: Sql, mailboxId: string, tokens: TokenSet): Promise<void> {
  await client.query(
    `INSERT INTO mailbox_credentials (mailbox_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (mailbox_id) DO UPDATE SET
       access_token_ciphertext = EXCLUDED.access_token_ciphertext,
       refresh_token_ciphertext = COALESCE(EXCLUDED.refresh_token_ciphertext, mailbox_credentials.refresh_token_ciphertext),
       token_expires_at = EXCLUDED.token_expires_at,
       scopes = EXCLUDED.scopes,
       updated_at = now()`,
    [
      mailboxId,
      encryptString(tokens.accessToken, encryptionKey()),
      tokens.refreshToken ? encryptString(tokens.refreshToken, encryptionKey()) : null,
      tokens.expiresAt ?? null,
      tokens.scopes,
    ],
  );
}

async function storeAttachment(organizationId: string, messageId: string, ticketId: string, client: Sql, attachment: ProviderMessage["attachments"][number]) {
  if (!attachmentAllowed(attachment.filename)) return;
  if (!attachment.contentBase64) return;
  const bytes = Buffer.from(attachment.contentBase64, "base64");
  if (bytes.length > 10 * 1024 * 1024) return;
  const id = randomUUID();
  const filename = safeFilename(attachment.filename);
  const directory = path.join(process.cwd(), "data", "attachments", organizationId);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, id), bytes);
  await client.query(
    `INSERT INTO attachments (id, organization_id, message_id, ticket_id, filename, content_type, size_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, organizationId, messageId, ticketId, filename, attachment.contentType, bytes.length, id],
  );
}

export async function ingestMessage(client: Sql, mailbox: MailboxRow, message: ProviderMessage): Promise<{ created: boolean; ticketId: string | null }> {
  const orgId = mailbox.organization_id;
  const existingProvider = await one(client, `SELECT id FROM messages WHERE mailbox_id = $1 AND provider_message_id = $2`, [mailbox.id, message.providerMessageId]);
  const existingHeader = message.messageIdHeader
    ? await one(client, `SELECT id FROM messages WHERE organization_id = $1 AND message_id_header = $2`, [orgId, message.messageIdHeader])
    : null;
  const existingApp = message.appMessageId
    ? await one<{ id: string }>(client, `SELECT id FROM messages WHERE id = $1 AND organization_id = $2`, [message.appMessageId, orgId])
    : null;
  if (existingApp) {
    await client.query(
      `UPDATE messages SET provider_message_id = COALESCE(provider_message_id, $2), provider_thread_id = COALESCE(provider_thread_id, $3), delivery_status = 'accepted', provider_accepted_at = COALESCE(provider_accepted_at, now()) WHERE id = $1`,
      [existingApp.id, message.providerMessageId, message.providerThreadId],
    );
    return { created: false, ticketId: null };
  }
  if (shouldSkipIngestion({ existingProviderId: Boolean(existingProvider), existingHeader: Boolean(existingHeader), existingAppMessageId: false })) {
    return { created: false, ticketId: null };
  }

  const fromMailbox = normalizeEmail(message.from.email) === normalizeEmail(mailbox.email_address);
  const references = referencedMessageIds(message.inReplyTo, message.referencesHeader);
  const providerThread = message.providerThreadId
    ? await one<{ ticket_id: string }>(client, `SELECT ticket_id FROM messages WHERE organization_id = $1 AND mailbox_id = $2 AND provider_thread_id = $3 LIMIT 1`, [orgId, mailbox.id, message.providerThreadId])
    : null;
  const headerMatch = references.length
    ? await one<{ ticket_id: string }>(client, `SELECT ticket_id FROM messages WHERE organization_id = $1 AND mailbox_id = $2 AND message_id_header = ANY($3::text[]) LIMIT 1`, [orgId, mailbox.id, references])
    : null;
  const referencing = message.messageIdHeader
    ? await one<{ ticket_id: string }>(
        client,
        `SELECT ticket_id FROM messages WHERE organization_id = $1 AND mailbox_id = $2 AND (in_reply_to = $3 OR references_header ILIKE $4) LIMIT 1`,
        [orgId, mailbox.id, message.messageIdHeader, `%${message.messageIdHeader}%`],
      )
    : null;
  const decision = decideThread({
    providerThreadTicketId: providerThread?.ticket_id ?? null,
    headerTicketId: headerMatch?.ticket_id ?? null,
    referencingTicketId: referencing?.ticket_id ?? null,
  });
  if (!decision.ticketId && (fromMailbox || message.direction === "outbound")) {
    return { created: false, ticketId: null };
  }

  const customerAddress = fromMailbox ? (message.to[0] ?? { email: mailbox.email_address, name: "Customer" }) : message.from;
  const customerId = await upsertCustomer(client, orgId, customerAddress.email, customerAddress.name || customerAddress.email);
  let ticketId = decision.ticketId;
  let createdTicket = false;
  if (!ticketId) {
    const reference = await one<{ next_ticket_reference: string }>(client, "SELECT next_ticket_reference($1)", [orgId]);
    const org = await one<{ default_priority: string }>(client, "SELECT default_priority FROM organizations WHERE id = $1", [orgId]);
    const ticket = await one<{ id: string }>(
      client,
      `INSERT INTO tickets (organization_id, reference, customer_id, subject, status, priority, assigned_team_id, mailbox_id, source, provider_thread_id)
       VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, 'email', $8) RETURNING id`,
      [orgId, reference?.next_ticket_reference, customerId, message.subject || "(no subject)", org?.default_priority ?? "normal", mailbox.team_id, mailbox.id, message.providerThreadId],
    );
    if (!ticket) throw new AppError("internal_error", "Could not create a ticket for the incoming message.", 500);
    ticketId = ticket.id;
    createdTicket = true;
    await client.query(
      `INSERT INTO ticket_events (organization_id, ticket_id, event_type, payload) VALUES ($1, $2, 'created', $3::jsonb)`,
      [orgId, ticketId, JSON.stringify({ source: "email", mailboxId: mailbox.id })],
    );
    await client.query(`INSERT INTO domain_events (organization_id, event_type, payload) VALUES ($1, 'ticket.created', $2::jsonb)`, [orgId, JSON.stringify({ ticketId, source: "email" })]);
  }

  const sanitized = message.bodyHtml ? sanitizeEmailHtml(message.bodyHtml) : null;
  let inserted: { id: string } | null = null;
  try {
    inserted = await one<{ id: string }>(
      client,
      `INSERT INTO messages (
        organization_id, ticket_id, mailbox_id, kind, delivery_status, customer_id, from_email, from_name, to_emails, cc_emails,
        subject, body_text, body_html, body_html_raw, provider, provider_message_id, provider_thread_id, message_id_header,
        in_reply_to, references_header, occurred_at
      ) VALUES (
        $1,$2,$3,$4,'received',$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      ) RETURNING id`,
      [
        orgId,
        ticketId,
        mailbox.id,
        fromMailbox ? "outbound" : "inbound",
        customerId,
        message.from.email,
        message.from.name ?? null,
        JSON.stringify(message.to),
        JSON.stringify(message.cc),
        message.subject,
        message.bodyText,
        sanitized,
        message.bodyHtml ?? null,
        mailbox.provider,
        message.providerMessageId,
        message.providerThreadId,
        message.messageIdHeader ?? null,
        message.inReplyTo ?? null,
        message.referencesHeader ?? null,
        message.occurredAt,
      ],
    );
  } catch (error) {
    const pg = error as { code?: string };
    if (pg.code === "23505") return { created: false, ticketId };
    throw error;
  }
  if (inserted) {
    for (const attachment of message.attachments) await storeAttachment(orgId, inserted.id, ticketId, client, attachment);
  }
  await client.query(`UPDATE tickets SET last_activity_at = GREATEST(last_activity_at, $2::timestamptz) WHERE id = $1`, [ticketId, message.occurredAt]);
  if (!fromMailbox) {
    const ticket = await one<{ reference: string; assigned_user_id: string | null; assigned_team_id: string | null }>(
      client,
      `SELECT reference, assigned_user_id, assigned_team_id FROM tickets WHERE id = $1`,
      [ticketId],
    );
    let recipients: string[] = [];
    if (ticket?.assigned_user_id) recipients = [ticket.assigned_user_id];
    else if (ticket?.assigned_team_id) {
      const members = await client.query<{ user_id: string }>(`SELECT user_id FROM team_memberships WHERE team_id = $1 AND organization_id = $2`, [ticket.assigned_team_id, orgId]);
      recipients = members.rows.map((row) => row.user_id);
    }
    await notifyUsers(client, {
      organizationId: orgId,
      userIds: recipients,
      type: "customer_reply",
      title: `New reply on ${ticket?.reference ?? "a ticket"}`,
      body: message.subject,
      ticketId,
      dedupeKey: `reply:${message.providerMessageId}`,
    });
  }
  return { created: createdTicket || Boolean(inserted), ticketId };
}

async function recordSyncFailure(organizationId: string, mailbox: MailboxRow, error: unknown): Promise<void> {
  const auth = error instanceof ProviderAuthError;
  const message = auth ? "Authorization expired. Reconnect the mailbox." : "Synchronization failed and will be retried.";
  await withWorkerOrg(organizationId, async (client) => {
    await client.query(`UPDATE mailboxes SET status = $2, sync_status = 'error', last_error = $3, status_reason = $3 WHERE id = $1`, [
      mailbox.id,
      auth ? "error" : mailbox.status,
      message,
    ]);
    if (!auth) return;
    const admins = await client.query<{ user_id: string }>(`SELECT user_id FROM organization_memberships WHERE organization_id = $1 AND role = 'org_admin' AND status = 'active'`, [organizationId]);
    await notifyUsers(client, {
      organizationId,
      userIds: admins.rows.map((row) => row.user_id),
      type: "mailbox_connection_failed",
      title: `Reconnect ${mailbox.email_address}`,
      body: message,
      dedupeKey: `mailbox-auth:${mailbox.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  });
}

export async function syncMailbox(organizationId: string, mailboxId: string): Promise<{ ingested: number; skipped: number }> {
  const mailbox = await withWorkerOrg(organizationId, (client) =>
    one<MailboxRow>(client, `SELECT id, organization_id, team_id, provider, email_address, display_name, status FROM mailboxes WHERE id = $1 AND organization_id = $2`, [mailboxId, organizationId]),
  );
  if (!mailbox || mailbox.status === "disconnected") return { ingested: 0, skipped: 0 };
  let tokens: TokenSet;
  try {
    tokens = await withWorkerOrg(organizationId, (client) => loadTokens(client, mailbox.id, mailbox.provider));
  } catch (error) {
    await recordSyncFailure(organizationId, mailbox, error);
    throw error;
  }
  try {
    return await withWorkerOrg(organizationId, async (client) => {
      await client.query(`UPDATE mailboxes SET sync_status = 'syncing', last_sync_at = now() WHERE id = $1`, [mailbox.id]);
      const state = await one<{ cursor: string | null }>(client, `SELECT cursor FROM mailbox_sync_states WHERE mailbox_id = $1`, [mailbox.id]);
      const listed = await listProviderMessages(mailbox.provider, client, mailbox.id, mailbox.email_address, tokens, state?.cursor ?? null);
      let ingested = 0;
      let skipped = 0;
      for (const message of listed.messages) {
        const result = await ingestMessage(client, mailbox, message);
        if (result.created) ingested += 1;
        else skipped += 1;
      }
      await client.query(
        `INSERT INTO mailbox_sync_states (mailbox_id, cursor, last_reconciled_at) VALUES ($1, $2, now())
         ON CONFLICT (mailbox_id) DO UPDATE SET cursor = EXCLUDED.cursor, last_reconciled_at = now(), updated_at = now()`,
        [mailbox.id, listed.cursor],
      );
      await client.query(`UPDATE mailboxes SET status = 'connected', sync_status = 'ok', last_success_at = now(), last_error = NULL, status_reason = NULL WHERE id = $1`, [mailbox.id]);
      return { ingested, skipped };
    });
  } catch (error) {
    await recordSyncFailure(organizationId, mailbox, error);
    throw error;
  }
}

export async function deliverMessage(organizationId: string, messageId: string): Promise<void> {
  await withWorkerOrg(organizationId, async (client) => {
    const message = await one<{
      id: string;
      kind: string;
      delivery_status: string;
      mailbox_id: string | null;
      subject: string | null;
      body_text: string;
      body_html: string | null;
      to_emails: { email: string; name?: string }[];
      cc_emails: { email: string; name?: string }[];
      provider_thread_id: string | null;
      in_reply_to: string | null;
      references_header: string | null;
      ticket_id: string;
    }>(
      client,
      `SELECT id, kind, delivery_status, mailbox_id, subject, body_text, body_html, to_emails, cc_emails, provider_thread_id, in_reply_to, references_header, ticket_id
       FROM messages WHERE id = $1 AND organization_id = $2`,
      [messageId, organizationId],
    );
    if (!message || message.kind !== "outbound") return;
    if (message.delivery_status === "accepted") return;
    if (!message.mailbox_id) throw new Error("The reply has no mailbox.");
    const mailbox = await one<MailboxRow>(client, `SELECT id, organization_id, team_id, provider, email_address, display_name, status FROM mailboxes WHERE id = $1`, [message.mailbox_id]);
    if (!mailbox || mailbox.status === "disconnected") throw new Error("The mailbox is not connected.");
    await client.query(`UPDATE messages SET delivery_status = 'sending' WHERE id = $1 AND delivery_status IN ('queued','failed','sending')`, [message.id]);
    const tokens = await loadTokens(client, mailbox.id, mailbox.provider);
    const already = await findSentMessage(mailbox.provider, client, tokens, message.id);
    const draft: OutboundDraft = {
      appMessageId: message.id,
      from: { email: mailbox.email_address, name: mailbox.display_name || mailbox.email_address },
      to: message.to_emails,
      cc: message.cc_emails,
      subject: message.subject ?? "",
      bodyText: message.body_text,
      bodyHtml: message.body_html ?? undefined,
      threadId: message.provider_thread_id,
      inReplyTo: message.in_reply_to,
      references: message.references_header,
    };
    const sent = already ?? (await sendProviderMessage(mailbox.provider, client, mailbox.id, tokens, draft));
    await client.query(
      `UPDATE messages SET delivery_status = 'accepted', provider_message_id = $2, provider_thread_id = $3, message_id_header = $4,
        provider_accepted_at = now(), send_error = NULL, provider = $5 WHERE id = $1`,
      [message.id, sent.providerMessageId, sent.providerThreadId, sent.messageIdHeader, mailbox.provider],
    );
    await client.query(`UPDATE tickets SET provider_thread_id = COALESCE(provider_thread_id, $2), last_activity_at = now() WHERE id = $1`, [message.ticket_id, sent.providerThreadId]);
    await client.query(`INSERT INTO domain_events (organization_id, event_type, payload) VALUES ($1, 'message.sent', $2::jsonb)`, [organizationId, JSON.stringify({ messageId })]);
  });
}

export async function renewMailbox(organizationId: string, mailboxId: string): Promise<void> {
  await withWorkerOrg(organizationId, async (client) => {
    const mailbox = await one<MailboxRow>(client, `SELECT id, organization_id, team_id, provider, email_address, display_name, status FROM mailboxes WHERE id = $1 AND organization_id = $2`, [mailboxId, organizationId]);
    if (!mailbox || mailbox.status !== "connected") return;
    const tokens = await loadTokens(client, mailbox.id, mailbox.provider);
    const renewal = await renewSubscription(mailbox.provider, tokens, mailbox.id);
    await client.query(
      `INSERT INTO mailbox_sync_states (mailbox_id, subscription_id, subscription_expires_at, last_reconciled_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (mailbox_id) DO UPDATE SET subscription_id = EXCLUDED.subscription_id, subscription_expires_at = EXCLUDED.subscription_expires_at, last_reconciled_at = now()`,
      [mailbox.id, renewal.subscriptionId ?? null, renewal.expiresAt ?? null],
    );
  });
}
