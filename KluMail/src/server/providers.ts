import "server-only";
import { formatAddress, messageIdHeader, normalizeEmail, parseAddressList, stripHtmlToText } from "@/lib/email";
import type { EmailAddress, ProviderId } from "@/lib/types";
import { one, withWorkerOrg, type Sql } from "@/server/db";

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

export class ProviderRateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(seconds: number) {
    super("The mailbox provider asked us to slow down.");
    this.name = "ProviderRateLimitError";
    this.retryAfterSeconds = seconds;
  }
}

export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

export type TokenSet = { accessToken: string; refreshToken?: string; expiresAt?: string; scopes: string };

export type ProviderAttachment = { filename: string; contentType: string; size: number; contentBase64?: string };

export type ProviderMessage = {
  providerMessageId: string;
  providerThreadId: string;
  messageIdHeader?: string;
  inReplyTo?: string;
  referencesHeader?: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  occurredAt: string;
  attachments: ProviderAttachment[];
  appMessageId?: string;
  direction: "inbound" | "outbound";
};

export type SyncCursor = { value: string | null };

export type OutboundDraft = {
  appMessageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
};

export type SendResult = { providerMessageId: string; providerThreadId: string; messageIdHeader: string };

type GmailHeader = { name: string; value: string };
type GmailPart = { mimeType?: string; filename?: string; headers?: GmailHeader[]; body?: { data?: string; size?: number }; parts?: GmailPart[] };

function header(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value;
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function collectParts(part: GmailPart | undefined, found: { text?: string; html?: string; attachments: ProviderAttachment[] }): void {
  if (!part) return;
  if (part.filename) {
    found.attachments.push({ filename: part.filename, contentType: part.mimeType || "application/octet-stream", size: part.body?.size ?? 0 });
  } else if (part.mimeType === "text/plain" && part.body?.data && !found.text) {
    found.text = decodeBase64Url(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data && !found.html) {
    found.html = decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) collectParts(child, found);
}

export function parseGmailMessage(raw: { id: string; threadId: string; internalDate?: string; payload?: GmailPart }): ProviderMessage {
  const headers = raw.payload?.headers;
  const found: { text?: string; html?: string; attachments: ProviderAttachment[] } = { attachments: [] };
  collectParts(raw.payload, found);
  const from = parseAddressList(header(headers, "From"))[0] ?? { email: "unknown@example.com" };
  const appMessageId = header(headers, "X-KluMail-Message");
  return {
    providerMessageId: raw.id,
    providerThreadId: raw.threadId,
    messageIdHeader: header(headers, "Message-ID"),
    inReplyTo: header(headers, "In-Reply-To"),
    referencesHeader: header(headers, "References"),
    from,
    to: parseAddressList(header(headers, "To")),
    cc: parseAddressList(header(headers, "Cc")),
    subject: header(headers, "Subject") ?? "(no subject)",
    bodyText: found.text || (found.html ? stripHtmlToText(found.html) : ""),
    bodyHtml: found.html,
    occurredAt: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : new Date().toISOString(),
    attachments: found.attachments,
    appMessageId,
    direction: "inbound",
  };
}

export function parseGraphMessage(raw: Record<string, unknown>): ProviderMessage {
  const from = raw.from as { emailAddress?: { address?: string; name?: string } } | undefined;
  const mapRecipients = (value: unknown): EmailAddress[] =>
    Array.isArray(value)
      ? value.flatMap((item) => {
          const address = (item as { emailAddress?: { address?: string; name?: string } }).emailAddress;
          return address?.address ? [{ email: normalizeEmail(address.address), name: address.name }] : [];
        })
      : [];
  const body = raw.body as { contentType?: string; content?: string } | undefined;
  const html = body?.contentType === "html" ? body.content : undefined;
  const text = body?.contentType === "text" ? body.content ?? "" : html ? stripHtmlToText(html) : "";
  const headers = Array.isArray(raw.internetMessageHeaders) ? (raw.internetMessageHeaders as { name: string; value: string }[]) : [];
  const appMessageId = headers.find((item) => item.name.toLowerCase() === "x-klumail-message")?.value;
  const attachments = Array.isArray(raw.attachments)
    ? (raw.attachments as { name?: string; contentType?: string; size?: number }[]).map((item) => ({
        filename: item.name || "attachment",
        contentType: item.contentType || "application/octet-stream",
        size: item.size ?? 0,
      }))
    : [];
  return {
    providerMessageId: String(raw.id ?? ""),
    providerThreadId: String(raw.conversationId ?? raw.id ?? ""),
    messageIdHeader: typeof raw.internetMessageId === "string" ? raw.internetMessageId : undefined,
    inReplyTo: headers.find((item) => item.name.toLowerCase() === "in-reply-to")?.value,
    referencesHeader: headers.find((item) => item.name.toLowerCase() === "references")?.value,
    from: { email: normalizeEmail(from?.emailAddress?.address ?? "unknown@example.com"), name: from?.emailAddress?.name },
    to: mapRecipients(raw.toRecipients),
    cc: mapRecipients(raw.ccRecipients),
    subject: String(raw.subject ?? "(no subject)"),
    bodyText: text,
    bodyHtml: html,
    occurredAt: String(raw.receivedDateTime ?? raw.sentDateTime ?? new Date().toISOString()),
    attachments,
    appMessageId,
    direction: "inbound",
  };
}

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after") ?? "30");
    throw new ProviderRateLimitError(Number.isFinite(retry) ? retry : 30);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError("The mailbox provider rejected the saved authorization.");
  }
  return response;
}

function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function microsoftConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_REDIRECT_URI);
}

const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"].join(" ");
const MICROSOFT_SCOPES = ["offline_access", "openid", "email", "User.Read", "https://graph.microsoft.com/Mail.Read", "https://graph.microsoft.com/Mail.Send"].join(" ");

export function authorizationUrl(provider: ProviderId, state: string): string {
  if (provider === "mock") return `/api/oauth/mock/callback?code=mock-code&state=${encodeURIComponent(state)}`;
  if (provider === "gmail") {
    if (!googleConfigured()) throw new ProviderConfigError("Gmail is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI ?? "");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  }
  if (!microsoftConfigured()) {
    throw new ProviderConfigError("Microsoft 365 is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI.");
  }
  const tenant = process.env.MICROSOFT_TENANT || "common";
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", process.env.MICROSOFT_REDIRECT_URI ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", MICROSOFT_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("response_mode", "query");
  return url.toString();
}

async function exchangeForm(url: string, body: URLSearchParams): Promise<TokenSet> {
  const response = await providerFetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new ProviderAuthError("The mailbox provider did not accept the authorization code.");
  const json = (await response.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
    scopes: json.scope ?? "",
  };
}

export async function exchangeCode(provider: ProviderId, code: string): Promise<TokenSet> {
  if (provider === "mock") return { accessToken: `mock-access-${code}`, refreshToken: "mock-refresh", expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), scopes: "mock" };
  if (provider === "gmail") {
    return exchangeForm("https://oauth2.googleapis.com/token", new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
      grant_type: "authorization_code",
    }));
  }
  const tenant = process.env.MICROSOFT_TENANT || "common";
  return exchangeForm(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, new URLSearchParams({
    code,
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI ?? "",
    grant_type: "authorization_code",
    scope: MICROSOFT_SCOPES,
  }));
}

export async function refreshTokens(provider: ProviderId, refreshToken: string): Promise<TokenSet> {
  if (provider === "mock") {
    return { accessToken: `mock-access-${Date.now()}`, refreshToken, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), scopes: "mock" };
  }
  if (provider === "gmail") {
    return exchangeForm("https://oauth2.googleapis.com/token", new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }));
  }
  const tenant = process.env.MICROSOFT_TENANT || "common";
  return exchangeForm(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    scope: MICROSOFT_SCOPES,
  }));
}

export async function listProviderMessages(provider: ProviderId, client: Sql, mailboxId: string, mailboxEmail: string, tokens: TokenSet, cursor: string | null): Promise<{ messages: ProviderMessage[]; cursor: string | null }> {
  if (provider === "mock") return listMockMessages(client, mailboxId, mailboxEmail, cursor);
  if (provider === "gmail") return listGmailMessages(tokens, cursor);
  return listGraphMessages(tokens, cursor);
}

async function listMockMessages(client: Sql, mailboxId: string, mailboxEmail: string, cursor: string | null): Promise<{ messages: ProviderMessage[]; cursor: string | null }> {
  const controls = await one<{ fail_syncs_remaining: number }>(client, "SELECT fail_syncs_remaining FROM mock_mailbox_controls WHERE mailbox_id = $1", [mailboxId]);
  if ((controls?.fail_syncs_remaining ?? 0) > 0) {
    const mailbox = await one<{ organization_id: string }>(client, "SELECT organization_id FROM mailboxes WHERE id = $1", [mailboxId]);
    if (mailbox) {
      await withWorkerOrg(mailbox.organization_id, (writer) =>
        writer.query("UPDATE mock_mailbox_controls SET fail_syncs_remaining = fail_syncs_remaining - 1 WHERE mailbox_id = $1", [mailboxId]),
      );
    }
    throw new Error("simulated mailbox sync failure");
  }
  const result = await client.query(
    `SELECT * FROM mock_provider_messages WHERE mailbox_id = $1 AND ($2::timestamptz IS NULL OR occurred_at > $2::timestamptz) ORDER BY occurred_at ASC`,
    [mailboxId, cursor],
  );
  const messages: ProviderMessage[] = result.rows.map((row) => ({
    providerMessageId: row.provider_message_id as string,
    providerThreadId: row.provider_thread_id as string,
    messageIdHeader: (row.message_id_header as string | null) ?? undefined,
    inReplyTo: (row.in_reply_to as string | null) ?? undefined,
    referencesHeader: (row.references_header as string | null) ?? undefined,
    from: { email: row.from_email as string, name: (row.from_name as string | null) ?? undefined },
    to: (row.to_emails as EmailAddress[]) ?? [],
    cc: (row.cc_emails as EmailAddress[]) ?? [],
    subject: row.subject as string,
    bodyText: row.body_text as string,
    bodyHtml: (row.body_html as string | null) ?? undefined,
    occurredAt: new Date(row.occurred_at as string).toISOString(),
    attachments: (row.attachments as ProviderAttachment[]) ?? [],
    appMessageId: (row.app_message_id as string | null) ?? undefined,
    direction: normalizeEmail(row.from_email as string) === normalizeEmail(mailboxEmail) ? "outbound" : (row.direction as "inbound" | "outbound"),
  }));
  const last = messages.at(-1);
  return { messages, cursor: last?.occurredAt ?? cursor };
}

async function listGmailMessages(tokens: TokenSet, cursor: string | null): Promise<{ messages: ProviderMessage[]; cursor: string | null }> {
  const listed = cursor
    ? await providerFetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded`, { headers: { authorization: `Bearer ${tokens.accessToken}` } })
    : await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=newer_than:14d", { headers: { authorization: `Bearer ${tokens.accessToken}` } });
  if (listed.status === 404) return listGmailMessages(tokens, null);
  if (!listed.ok) throw new Error("Gmail message list failed");
  const json = (await listed.json()) as { messages?: { id: string }[]; history?: { messagesAdded?: { message: { id: string } }[] }[]; historyId?: string };
  const ids = cursor
    ? (json.history ?? []).flatMap((item) => item.messagesAdded ?? []).map((item) => item.message.id)
    : (json.messages ?? []).map((item) => item.id);
  const messages: ProviderMessage[] = [];
  for (const id of ids) {
    const detail = await providerFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
    if (!detail.ok) continue;
    messages.push(parseGmailMessage((await detail.json()) as { id: string; threadId: string; internalDate?: string; payload?: GmailPart }));
  }
  return { messages, cursor: json.historyId ?? cursor };
}

async function listGraphMessages(tokens: TokenSet, cursor: string | null): Promise<{ messages: ProviderMessage[]; cursor: string | null }> {
  const url = cursor ?? "https://graph.microsoft.com/v1.0/me/messages/delta?$top=25";
  const response = await providerFetch(url, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
  if (!response.ok) throw new Error("Microsoft Graph message list failed");
  const json = (await response.json()) as { value?: Record<string, unknown>[]; "@odata.deltaLink"?: string; "@odata.nextLink"?: string };
  return {
    messages: (json.value ?? []).filter((item) => item.id).map((item) => parseGraphMessage(item)),
    cursor: json["@odata.deltaLink"] ?? json["@odata.nextLink"] ?? cursor,
  };
}

function rfc822(draft: OutboundDraft): string {
  const headers = [
    `From: ${formatAddress(draft.from)}`,
    `To: ${draft.to.map(formatAddress).join(", ")}`,
    draft.cc.length ? `Cc: ${draft.cc.map(formatAddress).join(", ")}` : "",
    `Subject: ${draft.subject}`,
    `Message-ID: ${messageIdHeader(draft.appMessageId)}`,
    `X-KluMail-Message: ${draft.appMessageId}`,
    draft.inReplyTo ? `In-Reply-To: ${draft.inReplyTo}` : "",
    draft.references ? `References: ${draft.references}` : "",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ].filter(Boolean);
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${draft.bodyText}`).toString("base64url");
}

export async function findSentMessage(provider: ProviderId, client: Sql, tokens: TokenSet, appMessageId: string): Promise<SendResult | null> {
  if (provider === "mock") {
    const row = await one<{ provider_message_id: string; provider_thread_id: string; message_id_header: string | null }>(
      client,
      `SELECT provider_message_id, provider_thread_id, message_id_header FROM mock_provider_messages WHERE app_message_id = $1`,
      [appMessageId],
    );
    return row ? { providerMessageId: row.provider_message_id, providerThreadId: row.provider_thread_id, messageIdHeader: row.message_id_header ?? messageIdHeader(appMessageId) } : null;
  }
  if (provider === "gmail") {
    const response = await providerFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`rfc822msgid:${messageIdHeader(appMessageId)}`)}`, {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { messages?: { id: string; threadId: string }[] };
    const first = json.messages?.[0];
    return first ? { providerMessageId: first.id, providerThreadId: first.threadId, messageIdHeader: messageIdHeader(appMessageId) } : null;
  }
  const response = await providerFetch(`https://graph.microsoft.com/v1.0/me/messages?$filter=internetMessageId eq '${messageIdHeader(appMessageId)}'`, {
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { value?: { id: string; conversationId: string }[] };
  const first = json.value?.[0];
  return first ? { providerMessageId: first.id, providerThreadId: first.conversationId, messageIdHeader: messageIdHeader(appMessageId) } : null;
}

export async function sendProviderMessage(provider: ProviderId, client: Sql, mailboxId: string, tokens: TokenSet, draft: OutboundDraft): Promise<SendResult> {
  const existing = await findSentMessage(provider, client, tokens, draft.appMessageId);
  if (existing) return existing;
  if (provider === "mock") return sendMock(client, mailboxId, draft);
  if (provider === "gmail") return sendGmail(tokens, draft);
  return sendGraph(tokens, draft);
}

async function sendMock(client: Sql, mailboxId: string, draft: OutboundDraft): Promise<SendResult> {
  const controls = await one<{ fail_sends_remaining: number }>(client, "SELECT fail_sends_remaining FROM mock_mailbox_controls WHERE mailbox_id = $1", [mailboxId]);
  if ((controls?.fail_sends_remaining ?? 0) > 0) {
    const owner = await one<{ organization_id: string }>(client, "SELECT organization_id FROM mailboxes WHERE id = $1", [mailboxId]);
    if (owner) {
      await withWorkerOrg(owner.organization_id, (writer) =>
        writer.query("UPDATE mock_mailbox_controls SET fail_sends_remaining = fail_sends_remaining - 1 WHERE mailbox_id = $1", [mailboxId]),
      );
    }
    throw new Error("simulated mailbox rejected the message");
  }
  const mailbox = await one<{ organization_id: string }>(client, "SELECT organization_id FROM mailboxes WHERE id = $1", [mailboxId]);
  const providerMessageId = `mock-${draft.appMessageId}`;
  const threadId = draft.threadId || `thread-${draft.appMessageId}`;
  await client.query(
    `INSERT INTO mock_provider_messages (
      organization_id, mailbox_id, provider_message_id, provider_thread_id, direction, from_email, from_name,
      to_emails, cc_emails, subject, body_text, body_html, message_id_header, in_reply_to, references_header, app_message_id, occurred_at
    ) VALUES ($1,$2,$3,$4,'outbound',$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15, now())
    ON CONFLICT (mailbox_id, provider_message_id) DO NOTHING`,
    [
      mailbox?.organization_id,
      mailboxId,
      providerMessageId,
      threadId,
      draft.from.email,
      draft.from.name ?? null,
      JSON.stringify(draft.to),
      JSON.stringify(draft.cc),
      draft.subject,
      draft.bodyText,
      draft.bodyHtml ?? null,
      messageIdHeader(draft.appMessageId),
      draft.inReplyTo ?? null,
      draft.references ?? null,
      draft.appMessageId,
    ],
  );
  return { providerMessageId, providerThreadId: threadId, messageIdHeader: messageIdHeader(draft.appMessageId) };
}

async function sendGmail(tokens: TokenSet, draft: OutboundDraft): Promise<SendResult> {
  const created = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { raw: rfc822(draft), threadId: draft.threadId ?? undefined } }),
  });
  if (!created.ok) throw new Error("Gmail did not accept the draft");
  const draftJson = (await created.json()) as { id: string; message?: { id: string; threadId: string } };
  const sent = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ id: draftJson.id }),
  });
  if (!sent.ok) throw new Error("Gmail did not accept the message");
  const json = (await sent.json()) as { id: string; threadId: string };
  return { providerMessageId: json.id, providerThreadId: json.threadId, messageIdHeader: messageIdHeader(draft.appMessageId) };
}

async function sendGraph(tokens: TokenSet, draft: OutboundDraft): Promise<SendResult> {
  const created = await providerFetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      subject: draft.subject,
      body: { contentType: "Text", content: draft.bodyText },
      toRecipients: draft.to.map((item) => ({ emailAddress: { address: item.email, name: item.name } })),
      ccRecipients: draft.cc.map((item) => ({ emailAddress: { address: item.email, name: item.name } })),
      internetMessageHeaders: [{ name: "X-KluMail-Message", value: draft.appMessageId }],
    }),
  });
  if (!created.ok) throw new Error("Microsoft Graph did not accept the draft");
  const json = (await created.json()) as { id: string; conversationId?: string };
  const sent = await providerFetch(`https://graph.microsoft.com/v1.0/me/messages/${json.id}/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!sent.ok && sent.status !== 202) throw new Error("Microsoft Graph did not accept the message");
  return { providerMessageId: json.id, providerThreadId: json.conversationId ?? json.id, messageIdHeader: messageIdHeader(draft.appMessageId) };
}

export async function renewSubscription(provider: ProviderId, tokens: TokenSet, mailboxId: string): Promise<{ subscriptionId?: string; expiresAt?: string; mode: "webhook" | "polling" }> {
  if (provider === "gmail" && process.env.GOOGLE_PUBSUB_TOPIC) {
    const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ topicName: process.env.GOOGLE_PUBSUB_TOPIC, labelIds: ["INBOX"] }),
    });
    if (!response.ok) return { mode: "polling" };
    const json = (await response.json()) as { historyId?: string; expiration?: string };
    return { subscriptionId: json.historyId, expiresAt: json.expiration ? new Date(Number(json.expiration)).toISOString() : undefined, mode: "webhook" };
  }
  if (provider === "microsoft" && process.env.MICROSOFT_WEBHOOK_URL) {
    const expiration = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const response = await providerFetch("https://graph.microsoft.com/v1.0/subscriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: process.env.MICROSOFT_WEBHOOK_URL,
        resource: "me/messages",
        expirationDateTime: expiration,
        clientState: mailboxId,
      }),
    });
    if (!response.ok) return { mode: "polling" };
    const json = (await response.json()) as { id?: string; expirationDateTime?: string };
    return { subscriptionId: json.id, expiresAt: json.expirationDateTime, mode: "webhook" };
  }
  return { mode: "polling", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
}
