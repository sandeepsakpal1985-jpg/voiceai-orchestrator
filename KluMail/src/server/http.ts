import "server-only";
import { timingSafeEqual } from "node:crypto";
import { AppError, isAppError, publicError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { parseTicketQuery } from "@/lib/filters";
import { originMatchesRequest } from "@/lib/origin";
import { recentRange } from "@/lib/time";
import type { Priority, ProviderId, TicketStatus } from "@/lib/types";
import { checkDatabaseRole } from "@/server/db";
import { getSession, listDevelopmentEmails, loginUser, logoutUser, registerUser, requestPasswordReset, resetPassword, updateProfile, verifyEmail } from "@/server/auth";
import { requireActor, requireUser } from "@/server/actor";
import {
  acceptInvitation,
  addTeamMember,
  archiveCategory,
  archiveTag,
  createCategory,
  createInvitation,
  createOrganization,
  createTag,
  createTeam,
  listCategories,
  listMembers,
  listPreferences,
  listTags,
  listTeams,
  previewInvitation,
  readLogo,
  removeTeamMember,
  saveLogo,
  setPreference,
  updateMember,
  updateOrganization,
  updateSignature,
  updateTeam,
} from "@/server/workspace";
import { assignTicket, bulkUpdate, createManualTicket, getCustomer, linkTickets, listTickets, mergeCustomers, mergeTickets, searchCustomers, setTicketTag, ticketDetail, updateCustomer, updateTicketFields, updateTicketStatus } from "@/server/tickets";
import { addInternalNote, queueReply, readAttachment, saveDraft, savedViews, saveView } from "@/server/conversation";
import { beginMailboxConnect, completeMailboxConnect, disconnectMailbox, expireMockToken, injectMockMessage, listMailboxes, requestSync } from "@/server/mailboxes";
import { dashboard, exportTickets, markRead, notificationsFor } from "@/server/insights";
import { enqueueReconciliation, processAvailableJobs } from "@/server/jobs";

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : undefined;
}

function setCookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.APP_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("validation_error", "The request body is invalid.", 400);
    return body as Record<string, unknown>;
  }
  const form = await request.formData();
  const data: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") {
      data[key] = value;
      continue;
    }
    const current = data[key];
    if (current === undefined) data[key] = value;
    else data[key] = Array.isArray(current) ? [...current, value] : [current, value];
  }
  return data;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim());
  return [];
}

function wantsJson(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return type.includes("application/json") || (accept.includes("application/json") && !accept.includes("text/html"));
}

function respond(request: Request, status: number, body: unknown, extra: { cookies?: string[]; redirectTo?: string } = {}): Response {
  const headers = new Headers();
  for (const cookie of extra.cookies ?? []) headers.append("set-cookie", cookie);
  if (!wantsJson(request) && extra.redirectTo) {
    headers.set("location", extra.redirectTo);
    return new Response(null, { status: 303, headers });
  }
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/webhooks/") || path === "/api/internal/jobs/tick") return;
  const origin = request.headers.get("origin");
  if (!originMatchesRequest(origin, request.headers.get("host"), request.url)) {
    throw new AppError("csrf", "Cross-site request blocked.", 403);
  }
}

async function actorFrom(request: Request) {
  return requireActor(cookieValue(request.headers.get("cookie"), "klumail_session"), cookieValue(request.headers.get("cookie"), "klumail_org") ?? null);
}

function back(request: Request, fallback: string, error?: string): string {
  const referer = request.headers.get("referer");
  let target = fallback;
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.host === new URL(request.url).host) target = `${url.pathname}${url.search}`;
    } catch {
      target = fallback;
    }
  }
  const next = new URL(target, request.url);
  if (error) next.searchParams.set("error", error);
  else next.searchParams.delete("error");
  return `${next.pathname}${next.search}`;
}

export async function handleApi(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    return await route(request);
  } catch (error) {
    const mapped = publicError(error);
    if (!isAppError(error)) log("error", "request failed", { path: new URL(request.url).pathname, error: error instanceof Error ? error.name : "error" });
    if (!wantsJson(request) && request.method !== "GET") {
      return respond(request, mapped.status, mapped.body, { redirectTo: back(request, "/login", mapped.body.error.message) });
    }
    return respond(request, mapped.status, mapped.body);
  }
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();
  const [root, second, third] = parts;

  if (method === "GET" && root === "health") {
    const role = await checkDatabaseRole();
    const productionBlocked = process.env.APP_ENV === "production" && !role.ok;
    return respond(request, productionBlocked ? 500 : 200, { ok: role.ok && !productionBlocked, role: role.role, superuser: role.superuser });
  }

  if (method === "GET" && root === "dev" && second === "outbox") {
    const host = url.hostname;
    if (process.env.APP_ENV !== "development" || (host !== "localhost" && host !== "127.0.0.1")) {
      throw new AppError("not_found", "Not found.", 404);
    }
    return respond(request, 200, { emails: await listDevelopmentEmails() });
  }

  if (root === "internal" && second === "jobs" && third === "tick" && method === "POST") {
    const provided = request.headers.get("x-worker-secret") ?? "";
    const expected = process.env.WORKER_SECRET ?? "";
    const left = Buffer.from(provided);
    const right = Buffer.from(expected);
    if (!expected || left.length !== right.length || !timingSafeEqual(left, right)) throw new AppError("forbidden", "Worker secret was rejected.", 403);
    await enqueueReconciliation();
    const result = await processAvailableJobs(25);
    return respond(request, 200, result);
  }

  if (root === "webhooks" && second === "gmail" && method === "POST") {
    return respond(request, 202, { accepted: true, mode: process.env.GOOGLE_PUBSUB_TOPIC ? "webhook" : "polling" });
  }
  if (root === "webhooks" && second === "microsoft" && method === "POST") {
    const validation = url.searchParams.get("validationToken");
    if (validation) return new Response(validation, { status: 200, headers: { "content-type": "text/plain" } });
    return respond(request, 202, { accepted: true });
  }

  if (root === "auth" && second === "register" && method === "POST") {
    const body = await readPayload(request);
    const result = await registerUser({ name: stringValue(body.name), email: stringValue(body.email), password: stringValue(body.password) });
    return respond(request, 201, result, { redirectTo: "/login?notice=Account created. Check your email to verify it." });
  }
  if (root === "auth" && second === "login" && method === "POST") {
    const body = await readPayload(request);
    const result = await loginUser({ email: stringValue(body.email), password: stringValue(body.password), userAgent: request.headers.get("user-agent") ?? undefined });
    const orgs = await import("@/server/actor").then((mod) => mod.listOrganizations(result.user.userId));
    const destination = orgs[0] ? "/dashboard" : "/onboarding";
    const cookies = [setCookie("klumail_session", result.token, 60 * 60 * 24 * 14)];
    if (orgs[0]) cookies.push(setCookie("klumail_org", orgs[0].id, 60 * 60 * 24 * 14));
    return respond(request, 200, { user: result.user }, { cookies, redirectTo: destination });
  }
  if (root === "auth" && second === "logout" && method === "POST") {
    await logoutUser(cookieValue(request.headers.get("cookie"), "klumail_session"));
    return respond(request, 200, { ok: true }, {
      cookies: [setCookie("klumail_session", "", 0), setCookie("klumail_org", "", 0)],
      redirectTo: "/login",
    });
  }
  if (root === "auth" && second === "forgot-password" && method === "POST") {
    const body = await readPayload(request);
    const result = await requestPasswordReset(stringValue(body.email));
    return respond(request, 200, result, { redirectTo: "/forgot-password?notice=If an account exists for that email, a reset link has been sent." });
  }
  if (root === "auth" && second === "reset-password" && method === "POST") {
    const body = await readPayload(request);
    await resetPassword(stringValue(body.token), stringValue(body.password));
    return respond(request, 200, { ok: true }, { redirectTo: "/login?notice=Password updated. Sign in with the new password." });
  }
  if (root === "auth" && second === "verify-email" && method === "POST") {
    const body = await readPayload(request);
    await verifyEmail(stringValue(body.token));
    return respond(request, 200, { ok: true }, { redirectTo: "/login?notice=Email verified." });
  }
  if (root === "auth" && second === "me" && method === "GET") {
    const session = await getSession(cookieValue(request.headers.get("cookie"), "klumail_session"));
    if (!session) throw new AppError("unauthenticated", "Sign in to continue.", 401);
    return respond(request, 200, session);
  }

  if (root === "profile" && method === "POST") {
    const user = await requireUser(cookieValue(request.headers.get("cookie"), "klumail_session"));
    const body = await readPayload(request);
    await updateProfile(user.userId, {
      name: stringValue(body.name) || undefined,
      currentPassword: stringValue(body.currentPassword) || undefined,
      newPassword: stringValue(body.newPassword) || undefined,
    });
    return respond(request, 200, { ok: true }, { redirectTo: "/profile?notice=Profile saved." });
  }

  if (root === "organizations" && method === "POST" && !second) {
    const user = await requireUser(cookieValue(request.headers.get("cookie"), "klumail_session"));
    const body = await readPayload(request);
    const created = await createOrganization(user.userId, { name: stringValue(body.name), timezone: stringValue(body.timezone) || "UTC" });
    return respond(request, 201, created, { cookies: [setCookie("klumail_org", created.id, 60 * 60 * 24 * 14)], redirectTo: "/dashboard" });
  }
  if (root === "organizations" && second === "switch" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const organizationId = stringValue(body.organizationId);
    const { listOrganizations } = await import("@/server/actor");
    const orgs = await listOrganizations(actor.userId);
    if (!orgs.some((item) => item.id === organizationId && item.status === "active")) throw new AppError("forbidden", "You do not belong to that organization.", 403);
    return respond(request, 200, { ok: true }, { cookies: [setCookie("klumail_org", organizationId, 60 * 60 * 24 * 14)], redirectTo: "/dashboard" });
  }
  if (root === "organizations" && second === "current" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await updateOrganization(actor, {
      name: stringValue(body.name) || undefined,
      timezone: stringValue(body.timezone) || undefined,
      defaultPriority: (stringValue(body.defaultPriority) || undefined) as Priority | undefined,
      defaultSignature: body.defaultSignature === undefined ? undefined : stringValue(body.defaultSignature),
    });
    if (body.emailSignature !== undefined) await updateSignature(actor, stringValue(body.emailSignature));
    return respond(request, 200, { ok: true }, { redirectTo: "/settings?notice=Settings saved." });
  }
  if (root === "organizations" && second === "logo" && method === "POST") {
    const actor = await actorFrom(request);
    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) throw new AppError("validation_error", "Choose a logo file.", 400);
    await saveLogo(actor, { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type });
    return respond(request, 200, { ok: true }, { redirectTo: "/settings?notice=Logo updated." });
  }
  if (root === "branding" && second === "logo" && method === "GET") {
    const actor = await actorFrom(request);
    const logo = await readLogo(actor);
    if (!logo) throw new AppError("not_found", "No logo has been uploaded.", 404);
    return new Response(new Uint8Array(logo.bytes), { status: 200, headers: { "content-type": logo.contentType, "cache-control": "private, max-age=60" } });
  }

  if (root === "invitations" && method === "POST" && !second) {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const result = await createInvitation(actor, { email: stringValue(body.email), role: stringValue(body.role), teamId: stringValue(body.teamId) || null });
    return respond(request, 201, result, { redirectTo: `/users?notice=Invitation created&invite=${encodeURIComponent(result.invitePath)}` });
  }
  if (root === "invitations" && second === "preview" && method === "GET") {
    return respond(request, 200, await previewInvitation(url.searchParams.get("token") ?? ""));
  }
  if (root === "invitations" && second === "accept" && method === "POST") {
    const user = await requireUser(cookieValue(request.headers.get("cookie"), "klumail_session"));
    const body = await readPayload(request);
    const result = await acceptInvitation(user.userId, stringValue(body.token));
    return respond(request, 200, result, { cookies: [setCookie("klumail_org", result.organizationId, 60 * 60 * 24 * 14)], redirectTo: "/dashboard" });
  }

  if (root === "members" && second && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await updateMember(actor, second, { role: stringValue(body.role) || undefined, status: stringValue(body.status) === "disabled" || stringValue(body.status) === "active" ? (stringValue(body.status) as "active" | "disabled") : undefined });
    return respond(request, 200, { ok: true }, { redirectTo: "/users?notice=Member updated." });
  }

  if (root === "teams" && method === "GET") return respond(request, 200, await listTeams(await actorFrom(request)));
  if (root === "teams" && method === "POST" && !second) {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const team = await createTeam(actor, { name: stringValue(body.name), description: stringValue(body.description) });
    return respond(request, 201, team, { redirectTo: "/teams?notice=Team created." });
  }
  if (root === "teams" && second && third === "members" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    if (stringValue(body.action) === "remove") await removeTeamMember(actor, second, stringValue(body.userId));
    else await addTeamMember(actor, second, stringValue(body.userId));
    return respond(request, 200, { ok: true }, { redirectTo: "/teams?notice=Team membership updated." });
  }
  if (root === "teams" && second && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await updateTeam(actor, second, { name: stringValue(body.name) || undefined, description: stringValue(body.description) });
    return respond(request, 200, { ok: true }, { redirectTo: "/teams?notice=Team updated." });
  }

  if (root === "tickets" && method === "GET" && !second) {
    const actor = await actorFrom(request);
    const query = parseTicketQuery(Object.fromEntries(url.searchParams.entries()));
    return respond(request, 200, await listTickets(actor, query));
  }
  if (root === "tickets" && method === "POST" && !second) {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const created = await createManualTicket(actor, {
      subject: stringValue(body.subject),
      customerEmail: stringValue(body.customerEmail),
      customerName: stringValue(body.customerName),
      body: stringValue(body.body),
      teamId: stringValue(body.teamId) || null,
      priority: (stringValue(body.priority) || undefined) as Priority | undefined,
    });
    return respond(request, 201, created, { redirectTo: `/tickets/${created.id}` });
  }
  if (root === "tickets" && second === "bulk" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const result = await bulkUpdate(actor, { ticketIds: stringList(body.ticketIds), status: (stringValue(body.status) || undefined) as TicketStatus | undefined, assigneeId: stringValue(body.assigneeId) || null });
    return respond(request, 200, result);
  }
  if (root === "tickets" && second && method === "GET" && !third) return respond(request, 200, await ticketDetail(await actorFrom(request), second));
  if (root === "tickets" && second && third === "status" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await updateTicketStatus(actor, second, stringValue(body.status) as TicketStatus, stringValue(body.resolutionNote) || undefined);
    return respond(request, 200, { ok: true }, { redirectTo: `/tickets/${second}` });
  }
  if (root === "tickets" && second && third === "fields" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await updateTicketFields(actor, second, { priority: (stringValue(body.priority) || undefined) as Priority | undefined, categoryId: stringValue(body.categoryId) || null });
    return respond(request, 200, { ok: true }, { redirectTo: `/tickets/${second}` });
  }
  if (root === "tickets" && second && third === "assignment" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await assignTicket(actor, second, { assigneeId: stringValue(body.assigneeId) || null, teamId: stringValue(body.teamId) || null });
    return respond(request, 200, { ok: true }, { redirectTo: `/tickets/${second}?notice=Assignment updated.` });
  }
  if (root === "tickets" && second && third === "tags" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await setTicketTag(actor, second, stringValue(body.tagId), stringValue(body.enabled) !== "false");
    return respond(request, 200, { ok: true }, { redirectTo: `/tickets/${second}` });
  }
  if (root === "tickets" && second && third === "links" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await linkTickets(actor, second, stringValue(body.relatedTicketId), stringValue(body.linkType) === "duplicate" ? "duplicate" : "related");
    return respond(request, 200, { ok: true }, { redirectTo: `/tickets/${second}` });
  }
  if (root === "tickets" && second && third === "merge" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await mergeTickets(actor, second, stringValue(body.sourceTicketId));
    return respond(request, 200, { ok: true }, { redirectTo: `/tickets/${second}?notice=Tickets merged.` });
  }
  if (root === "tickets" && second && third === "notes" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const note = await addInternalNote(actor, second, stringValue(body.body));
    return respond(request, 201, note, { redirectTo: `/tickets/${second}` });
  }
  if (root === "tickets" && second && third === "reply" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const message = await queueReply(actor, second, {
      to: stringList(body.to),
      cc: stringList(body.cc),
      subject: stringValue(body.subject) || undefined,
      body: stringValue(body.body),
      clientRequestId: stringValue(body.clientRequestId) || undefined,
      forward: stringValue(body.forward) === "true",
    });
    return respond(request, 200, message, { redirectTo: `/tickets/${second}` });
  }
  if (root === "tickets" && second && third === "drafts" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const draft = await saveDraft(actor, second, { draftId: stringValue(body.draftId) || undefined, to: stringList(body.to), cc: stringList(body.cc), subject: stringValue(body.subject), body: stringValue(body.body) });
    return respond(request, 200, draft, { redirectTo: `/tickets/${second}?notice=Draft saved.` });
  }

  if (root === "customers" && method === "GET" && !second) return respond(request, 200, await searchCustomers(await actorFrom(request), url.searchParams.get("q") ?? ""));
  if (root === "customers" && second && method === "GET" && !third) return respond(request, 200, await getCustomer(await actorFrom(request), second));
  if (root === "customers" && second && method === "POST" && !third) {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    if (stringValue(body.action) === "merge") await mergeCustomers(actor, second, stringValue(body.sourceId));
    else await updateCustomer(actor, second, stringValue(body.displayName));
    return respond(request, 200, { ok: true }, { redirectTo: `/customers/${second}` });
  }

  if (root === "dashboard" && method === "GET") {
    const actor = await actorFrom(request);
    const range = recentRange(30, actor.timezone);
    const from = url.searchParams.get("from") || range.from;
    const to = url.searchParams.get("to") || range.to;
    return respond(request, 200, await dashboard(actor, from, to));
  }
  if (root === "reports" && second === "tickets.csv" && method === "GET") {
    const actor = await actorFrom(request);
    const csv = await exportTickets(actor, url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
    return new Response(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=\"tickets.csv\"" } });
  }
  if (root === "notifications" && method === "GET") return respond(request, 200, await notificationsFor(await actorFrom(request)));
  if (root === "notifications" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await markRead(actor, stringValue(body.id) || undefined);
    return respond(request, 200, { ok: true }, { redirectTo: "/notifications" });
  }

  if (root === "mailboxes" && method === "GET" && !second) return respond(request, 200, await listMailboxes(await actorFrom(request)));
  if (root === "mailboxes" && second === "connect" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const result = await beginMailboxConnect(actor, { provider: stringValue(body.provider), teamId: stringValue(body.teamId), email: stringValue(body.email) || undefined });
    return respond(request, 200, result, { redirectTo: result.redirectTo });
  }
  if (root === "mailboxes" && second && third === "sync" && method === "POST") {
    await requestSync(await actorFrom(request), second);
    return respond(request, 200, { ok: true }, { redirectTo: "/mailboxes?notice=Synchronization finished." });
  }
  if (root === "mailboxes" && second && third === "disconnect" && method === "POST") {
    await disconnectMailbox(await actorFrom(request), second);
    return respond(request, 200, { ok: true }, { redirectTo: "/mailboxes?notice=Mailbox disconnected. Existing tickets were kept." });
  }
  if (root === "mailboxes" && second && third === "mock-messages" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await injectMockMessage(actor, second, {
      fromEmail: stringValue(body.fromEmail),
      fromName: stringValue(body.fromName) || undefined,
      subject: stringValue(body.subject),
      body: stringValue(body.body),
      messageId: stringValue(body.messageId) || undefined,
      inReplyTo: stringValue(body.inReplyTo) || undefined,
      threadId: stringValue(body.threadId) || undefined,
    });
    return respond(request, 201, { ok: true }, { redirectTo: "/inbox?notice=Simulated message synchronized." });
  }
  if (root === "mailboxes" && second && third === "expire-token" && method === "POST") {
    await expireMockToken(await actorFrom(request), second);
    return respond(request, 200, { ok: true });
  }
  if (root === "oauth" && second && third === "callback" && method === "GET") {
    const actor = await actorFrom(request);
    const provider = second as ProviderId;
    const result = await completeMailboxConnect(actor, provider, url.searchParams.get("state") ?? "", url.searchParams.get("code") ?? "");
    return respond(request, 200, result, { redirectTo: `/mailboxes?notice=Mailbox connected&mailbox=${result.mailboxId}` });
  }

  if (root === "attachments" && second && method === "GET") {
    const file = await readAttachment(await actorFrom(request), second);
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.filename.replaceAll('"', "")}"`,
        "x-content-type-options": "nosniff",
      },
    });
  }

  if (root === "categories" && method === "GET") return respond(request, 200, await listCategories(await actorFrom(request)));
  if (root === "categories" && method === "POST" && !second) {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const created = await createCategory(actor, stringValue(body.name), stringValue(body.parentId) || null);
    return respond(request, 201, created, { redirectTo: "/settings?notice=Category added." });
  }
  if (root === "categories" && second && method === "POST") {
    await archiveCategory(await actorFrom(request), second);
    return respond(request, 200, { ok: true }, { redirectTo: "/settings?notice=Category archived." });
  }
  if (root === "tags" && method === "GET") return respond(request, 200, await listTags(await actorFrom(request)));
  if (root === "tags" && method === "POST" && !second) {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const created = await createTag(actor, stringValue(body.name), stringValue(body.color) || undefined);
    return respond(request, 201, created, { redirectTo: "/settings?notice=Tag added." });
  }
  if (root === "tags" && second && method === "POST") {
    await archiveTag(await actorFrom(request), second);
    return respond(request, 200, { ok: true }, { redirectTo: "/settings" });
  }
  if (root === "preferences" && method === "GET") return respond(request, 200, await listPreferences(await actorFrom(request)));
  if (root === "preferences" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    await setPreference(actor, stringValue(body.eventType), stringValue(body.inApp) !== "false");
    return respond(request, 200, { ok: true }, { redirectTo: "/settings?notice=Notification preference saved." });
  }
  if (root === "views" && method === "GET") return respond(request, 200, await savedViews(await actorFrom(request)));
  if (root === "views" && method === "POST") {
    const actor = await actorFrom(request);
    const body = await readPayload(request);
    const view = await saveView(actor, stringValue(body.name), body.query ?? {});
    return respond(request, 201, view);
  }
  if (root === "members" && method === "GET") return respond(request, 200, await listMembers(await actorFrom(request)));

  throw new AppError("not_found", "Not found.", 404);
}
