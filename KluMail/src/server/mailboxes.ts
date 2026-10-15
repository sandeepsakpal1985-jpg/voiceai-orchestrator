import "server-only";
import { AppError } from "@/lib/errors";
import { isEmail, normalizeEmail } from "@/lib/email";
import { randomToken, sha256, encryptString } from "@/lib/crypto";
import type { Actor, ProviderId } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";
import { one, rows, withAppUser, withWorkerOrg } from "@/server/db";
import { recordAudit } from "@/server/actor";
import { mailboxAdmin } from "@/server/workspace";
import { authorizationUrl, exchangeCode, ProviderConfigError } from "@/server/providers";
import { saveTokens } from "@/server/sync";
import { enqueueJob, kickJobs } from "@/server/jobs";

function assertProvider(value: string): ProviderId {
  if (!PROVIDERS.includes(value as ProviderId)) throw new AppError("validation_error", "Choose a mailbox provider.", 400);
  if (value === "mock" && process.env.APP_ENV === "production") {
    throw new AppError("validation_error", "Simulated mailboxes are available only in development.", 400);
  }
  return value as ProviderId;
}

export async function listMailboxes(actor: Actor) {
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    rows(
      client,
      `SELECT id, provider, email_address, display_name, status, status_reason, sync_status, last_sync_at, last_success_at, last_error, team_id
       FROM mailboxes WHERE organization_id = $1 ORDER BY email_address`,
      [actor.organizationId],
    ),
  );
}

export async function beginMailboxConnect(actor: Actor, input: { provider: string; teamId: string; email?: string }): Promise<{ redirectTo: string }> {
  mailboxAdmin(actor);
  const provider = assertProvider(input.provider);
  if (!input.teamId) throw new AppError("validation_error", "Choose the team that should receive mail from this mailbox.", 400);
  const email = input.email ? normalizeEmail(input.email) : null;
  if (provider === "mock" && (!email || !isEmail(email))) throw new AppError("validation_error", "Enter the simulated mailbox address.", 400);
  const state = randomToken();
  let redirectTo = "";
  try {
    redirectTo = authorizationUrl(provider, state);
  } catch (error) {
    if (error instanceof ProviderConfigError) throw new AppError("provider_not_configured", error.message, 400);
    throw error;
  }
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const team = await one(client, "SELECT id FROM teams WHERE id = $1 AND organization_id = $2", [input.teamId, actor.organizationId]);
    if (!team) throw new AppError("invalid_reference", "That team is not in this organization.", 400);
    await client.query(
      `INSERT INTO oauth_states (organization_id, user_id, provider, state_hash, team_id, email_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '15 minutes')`,
      [actor.organizationId, actor.userId, provider, sha256(state), input.teamId, email],
    );
  });
  return { redirectTo };
}

export async function completeMailboxConnect(actor: Actor, provider: ProviderId, state: string, code: string): Promise<{ mailboxId: string }> {
  mailboxAdmin(actor);
  const stateHash = sha256(state);
  const pending = await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const row = await one<{ id: string; provider: ProviderId; team_id: string | null; email_address: string | null; used_at: Date | null; expires_at: Date }>(
      client,
      `SELECT id, provider, team_id, email_address, used_at, expires_at FROM oauth_states WHERE state_hash = $1 AND user_id = $2`,
      [stateHash, actor.userId],
    );
    if (!row || row.provider !== provider) throw new AppError("invalid_state", "The mailbox connection request is invalid.", 400);
    if (row.used_at || row.expires_at.getTime() < Date.now()) throw new AppError("invalid_state", "The mailbox connection request has expired. Start again.", 400);
    await client.query(`UPDATE oauth_states SET used_at = now() WHERE id = $1`, [row.id]);
    return row;
  });
  let tokens;
  try {
    tokens = await exchangeCode(provider, code);
  } catch (error) {
    if (error instanceof ProviderConfigError) throw new AppError("provider_not_configured", error.message, 400);
    throw new AppError("provider_auth_failed", "The mailbox provider did not complete authorization.", 400);
  }
  const email = pending.email_address || `${provider}-mailbox@example.com`;
  return withWorkerOrg(actor.organizationId, async (client) => {
    const existing = await one<{ id: string }>(
      client,
      `SELECT id FROM mailboxes WHERE organization_id = $1 AND provider = $2 AND lower(email_address) = $3`,
      [actor.organizationId, provider, email],
    );
    const mailbox = existing
      ? existing
      : await one<{ id: string }>(
          client,
          `INSERT INTO mailboxes (organization_id, team_id, provider, email_address, display_name, status, created_by)
           VALUES ($1, $2, $3, $4, $5, 'connected', $6) RETURNING id`,
          [actor.organizationId, pending.team_id, provider, email, email, actor.userId],
        );
    if (!mailbox) throw new AppError("internal_error", "Could not save the mailbox.", 500);
    await client.query(`UPDATE mailboxes SET status = 'connected', team_id = $2, status_reason = NULL, last_error = NULL WHERE id = $1`, [mailbox.id, pending.team_id]);
    await saveTokens(client, mailbox.id, tokens);
    await client.query(
      `INSERT INTO mailbox_sync_states (mailbox_id) VALUES ($1) ON CONFLICT (mailbox_id) DO NOTHING`,
      [mailbox.id],
    );
    if (provider === "mock") {
      await client.query(`INSERT INTO mock_mailbox_controls (mailbox_id) VALUES ($1) ON CONFLICT (mailbox_id) DO NOTHING`, [mailbox.id]);
    }
    await enqueueJob(client, { organizationId: actor.organizationId, type: "mailbox.sync", payload: { mailboxId: mailbox.id }, dedupeKey: `sync:${mailbox.id}` });
    return { mailboxId: mailbox.id };
  }).then(async (result) => {
    await withAppUser(actor.userId, actor.organizationId, (client) => recordAudit(client, actor, "mailbox.connected", "mailbox", result.mailboxId, { provider }));
    await kickJobs();
    return result;
  });
}

export async function disconnectMailbox(actor: Actor, mailboxId: string) {
  mailboxAdmin(actor);
  await withWorkerOrg(actor.organizationId, async (client) => {
    const row = await one(client, `UPDATE mailboxes SET status = 'disconnected', status_reason = 'Disconnected by an administrator' WHERE id = $1 AND organization_id = $2 RETURNING id`, [mailboxId, actor.organizationId]);
    if (!row) throw new AppError("not_found", "That mailbox was not found.", 404);
    await client.query(`DELETE FROM mailbox_credentials WHERE mailbox_id = $1`, [mailboxId]);
  });
  await withAppUser(actor.userId, actor.organizationId, (client) => recordAudit(client, actor, "mailbox.disconnected", "mailbox", mailboxId, {}));
}

export async function requestSync(actor: Actor, mailboxId: string) {
  mailboxAdmin(actor);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const mailbox = await one(client, `SELECT id FROM mailboxes WHERE id = $1 AND organization_id = $2 AND status <> 'disconnected'`, [mailboxId, actor.organizationId]);
    if (!mailbox) throw new AppError("not_found", "That mailbox was not found.", 404);
    await enqueueJob(client, { organizationId: actor.organizationId, type: "mailbox.sync", payload: { mailboxId }, dedupeKey: `sync:${mailboxId}` });
  });
  await kickJobs();
}

export async function injectMockMessage(actor: Actor, mailboxId: string, input: { fromEmail: string; fromName?: string; subject: string; body: string; messageId?: string; inReplyTo?: string; threadId?: string }) {
  mailboxAdmin(actor);
  const email = normalizeEmail(input.fromEmail);
  if (!isEmail(email)) throw new AppError("validation_error", "Enter the sender's email address.", 400);
  await withWorkerOrg(actor.organizationId, async (client) => {
    const mailbox = await one<{ provider: string; email_address: string }>(client, `SELECT provider, email_address FROM mailboxes WHERE id = $1 AND organization_id = $2`, [mailboxId, actor.organizationId]);
    if (!mailbox || mailbox.provider !== "mock") throw new AppError("validation_error", "Only a simulated mailbox can accept injected messages.", 400);
    const messageId = input.messageId ?? `<${randomToken(8)}@customers.example>`;
    await client.query(
      `INSERT INTO mock_provider_messages (
        organization_id, mailbox_id, provider_message_id, provider_thread_id, direction, from_email, from_name,
        to_emails, subject, body_text, message_id_header, in_reply_to, occurred_at
      ) VALUES ($1,$2,$3,$4,'inbound',$5,$6,$7::jsonb,$8,$9,$10,$11, now())`,
      [
        actor.organizationId,
        mailboxId,
        `mock-in-${sha256(messageId).slice(0, 16)}`,
        input.threadId ?? `thread-${sha256(input.inReplyTo || messageId).slice(0, 12)}`,
        email,
        input.fromName ?? null,
        JSON.stringify([{ email: mailbox.email_address }]),
        input.subject,
        input.body,
        messageId,
        input.inReplyTo ?? null,
      ],
    );
  });
  await requestSync(actor, mailboxId);
}

export async function expireMockToken(actor: Actor, mailboxId: string) {
  mailboxAdmin(actor);
  await withWorkerOrg(actor.organizationId, async (client) => {
    const mailbox = await one(client, `SELECT id FROM mailboxes WHERE id = $1 AND organization_id = $2 AND provider = 'mock'`, [mailboxId, actor.organizationId]);
    if (!mailbox) throw new AppError("not_found", "That simulated mailbox was not found.", 404);
    await client.query(`UPDATE mailbox_credentials SET token_expires_at = now() - interval '5 minutes' WHERE mailbox_id = $1`, [mailboxId]);
  });
}

export function devTokenPlaceholder(value: string): string {
  return encryptString(value, process.env.APP_ENCRYPTION_KEY ?? "");
}
