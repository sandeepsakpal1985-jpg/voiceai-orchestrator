import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../helpers";
import { getSession, loginUser, logoutUser, registerUser, requestPasswordReset, resetPassword, verifyEmail } from "@/server/auth";
import { closePools, one, rows, withAppUser, withAuth, withWorkerOrg } from "@/server/db";
import { acceptInvitation, createInvitation, createOrganization, createTeam, updateMember } from "@/server/workspace";
import { actorFromToken, loadActor } from "@/server/actor";
import { assignTicket, createManualTicket, getTicket, listTickets, updateCustomer, updateTicketStatus } from "@/server/tickets";
import { addInternalNote, queueReply } from "@/server/conversation";
import { ticketDetail } from "@/server/tickets";
import { beginMailboxConnect, completeMailboxConnect, injectMockMessage, requestSync } from "@/server/mailboxes";
import { processAvailableJobs } from "@/server/jobs";
import { dashboard, exportTickets, markRead } from "@/server/insights";
import { AppError } from "@/lib/errors";
import { parseTicketQuery } from "@/lib/filters";
import type { Actor } from "@/lib/types";

const password = "correct-horse-1";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closePools();
});

async function orgAdmin(prefix: string) {
  const email = `${prefix}@example.com`;
  await registerUser({ email, name: prefix, password });
  const session = await loginUser({ email, password });
  const created = await createOrganization(session.user.userId, { name: `${prefix} org`, timezone: "UTC" });
  const actor = await loadActor(session.user.userId, session.user.email, session.user.name, session.user.emailVerified, created.id);
  if (!actor) throw new Error("actor missing");
  return { actor, token: session.token };
}

async function connectMock(actor: Actor, address: string) {
  const team = await createTeam(actor, { name: `${address} team`, description: "Support" });
  const connect = await beginMailboxConnect(actor, { provider: "mock", teamId: team.id, email: address });
  const state = new URL(connect.redirectTo, "http://127.0.0.1").searchParams.get("state");
  if (!state) throw new Error("oauth state missing");
  const done = await completeMailboxConnect(actor, "mock", state, "mock-code");
  return { mailboxId: done.mailboxId, teamId: team.id };
}

describe("authentication", () => {
  it("does not reveal whether a password reset address exists", async () => {
    const missing = await requestPasswordReset("missing@example.com");
    await registerUser({ email: "known@example.com", name: "Known", password });
    const known = await requestPasswordReset("known@example.com");
    expect(missing.message).toBe(known.message);
    expect(known.message.toLowerCase()).not.toContain("known@example.com");
  });

  it("consumes a reset token once and verifies email once", async () => {
    await registerUser({ email: "reset@example.com", name: "Reset", password });
    await requestPasswordReset("reset@example.com");
    const resetMail = await withAuth((client) =>
      one<{ body_text: string }>(client, "SELECT body_text FROM system_emails WHERE recipient_email = $1 AND template = 'password-reset'", ["reset@example.com"]),
    );
    const resetToken = resetMail?.body_text.match(/token=([^\s]+)/)?.[1];
    expect(resetToken).toBeTruthy();
    await resetPassword(resetToken ?? "", "new-password-1");
    await expect(resetPassword(resetToken ?? "", "new-password-2")).rejects.toBeInstanceOf(AppError);
    const session = await loginUser({ email: "reset@example.com", password: "new-password-1" });
    expect(session.user.userId).toBeTruthy();

    await registerUser({ email: "verify@example.com", name: "Verify", password });
    const verifyMail = await withAuth((client) =>
      one<{ body_text: string }>(client, "SELECT body_text FROM system_emails WHERE recipient_email = $1 AND template = 'verify-email'", ["verify@example.com"]),
    );
    const verifyToken = verifyMail?.body_text.match(/token=([^\s]+)/)?.[1];
    await verifyEmail(verifyToken ?? "");
    await expect(verifyEmail(verifyToken ?? "")).rejects.toBeInstanceOf(AppError);
  });

  it("revokes the session on logout", async () => {
    await registerUser({ email: "logout@example.com", name: "Logout", password });
    const session = await loginUser({ email: "logout@example.com", password });
    expect(await getSession(session.token)).not.toBeNull();
    await logoutUser(session.token);
    expect(await getSession(session.token)).toBeNull();
  });
});

describe("tenancy, tickets, and mail", () => {
  it("isolates organizations through RLS and application checks", async () => {
    const alpha = await orgAdmin("alpha");
    const beta = await orgAdmin("beta");
    const ticket = await createManualTicket(alpha.actor, { subject: "Alpha only", customerName: "Ada", customerEmail: "ada@customer.test", body: "Help", priority: "high" });
    expect(ticket.reference).toBe("KM-1001");
    const hidden = await withAppUser(beta.actor.userId, beta.actor.organizationId, (client) =>
      client.query("SELECT id FROM tickets WHERE id = $1", [ticket.id]),
    );
    expect(hidden.rows).toHaveLength(0);
    await expect(getTicket(beta.actor, ticket.id)).rejects.toBeInstanceOf(AppError);
    await expect(updateTicketStatus(beta.actor, ticket.id, "pending")).rejects.toBeInstanceOf(AppError);
  });

  it("creates, assigns, notes, and preserves history", async () => {
    const alpha = await orgAdmin("owner");
    const agentUser = await registerUser({ email: "agent@example.com", name: "Agent", password });
    const invite = await createInvitation(alpha.actor, { email: "agent@example.com", role: "agent" });
    const token = invite.invitePath.split("/").pop() ?? "";
    await acceptInvitation(agentUser.userId, token);
    const agentActor = await loadActor(agentUser.userId, "agent@example.com", "Agent", false, alpha.actor.organizationId);
    expect(agentActor?.role).toBe("agent");
    const ticket = await createManualTicket(alpha.actor, { subject: "Needs owner", customerName: "Bea", customerEmail: "bea@customer.test", body: "Question", priority: "normal" });
    await assignTicket(alpha.actor, ticket.id, { assigneeId: agentUser.userId, teamId: null });
    await updateTicketStatus(alpha.actor, ticket.id, "in_progress");
    await addInternalNote(alpha.actor, ticket.id, "Internal only");
    const detail = await ticketDetail(alpha.actor, ticket.id);
    expect(detail.messages.some((message) => message.kind === "internal_note" && message.body_text === "Internal only")).toBe(true);
    expect(detail.events.length).toBeGreaterThan(0);
    const mine = agentActor ? await listTickets(agentActor, parseTicketQuery({ view: "mine" })) : { items: [] };
    expect(mine.items).toHaveLength(1);
  });

  it("ingests a simulated email once and does not turn the reply into a new ticket", async () => {
    const alpha = await orgAdmin("mail");
    const mailbox = await connectMock(alpha.actor, "support@mail.test");
    await injectMockMessage(alpha.actor, mailbox.mailboxId, { fromEmail: "customer@mail.test", subject: "Broken widget", body: "It does not start" });
    await processAvailableJobs(10);
    const first = await listTickets(alpha.actor, parseTicketQuery({ view: "all" }));
    expect(first.total).toBe(1);
    const ticket = first.items[0];
    if (!ticket) throw new Error("ticket missing");
    const reply = await queueReply(alpha.actor, ticket.id, { to: ["customer@mail.test"], body: "We are looking at this.", clientRequestId: "reply-1" });
    expect(reply?.delivery_status).toBe("accepted");
    await queueReply(alpha.actor, ticket.id, { to: ["customer@mail.test"], body: "We are looking at this.", clientRequestId: "reply-1" });
    await requestSync(alpha.actor, mailbox.mailboxId);
    const detail = await ticketDetail(alpha.actor, ticket.id);
    expect(detail.messages.filter((message) => message.kind === "outbound")).toHaveLength(1);
    const after = await listTickets(alpha.actor, parseTicketQuery({ view: "all" }));
    expect(after.total).toBe(1);
  });

  it("records a failed simulated sync and recovers after the token refresh", async () => {
    const alpha = await orgAdmin("sync");
    const mailbox = await connectMock(alpha.actor, "sync@mail.test");
    await withWorkerOrg(alpha.actor.organizationId, async (client) => {
      await client.query("UPDATE mock_mailbox_controls SET fail_syncs_remaining = 1 WHERE mailbox_id = $1", [mailbox.mailboxId]);
      await client.query("UPDATE mailbox_credentials SET token_expires_at = now() - interval '5 minutes' WHERE mailbox_id = $1", [mailbox.mailboxId]);
    });
    await requestSync(alpha.actor, mailbox.mailboxId);
    const failed = await withAppUser(alpha.actor.userId, alpha.actor.organizationId, (client) =>
      one<{ last_error: string | null }>(client, "SELECT last_error FROM mailboxes WHERE id = $1", [mailbox.mailboxId]),
    );
    expect(failed?.last_error ?? "").toContain("retried");
    const refreshed = await withWorkerOrg(alpha.actor.organizationId, (client) =>
      one<{ token_refresh_count: number }>(client, "SELECT token_refresh_count FROM mock_mailbox_controls WHERE mailbox_id = $1", [mailbox.mailboxId]),
    );
    expect(Number(refreshed?.token_refresh_count)).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await processAvailableJobs(5);
    const recovered = await withAppUser(alpha.actor.userId, alpha.actor.organizationId, (client) =>
      one<{ last_error: string | null }>(client, "SELECT last_error FROM mailboxes WHERE id = $1", [mailbox.mailboxId]),
    );
    expect(recovered?.last_error).toBeNull();
  });

  it("calculates dashboard totals from records and blocks agent export", async () => {
    const alpha = await orgAdmin("dash");
    await createManualTicket(alpha.actor, { subject: "One", customerName: "C", customerEmail: "c@customer.test", body: "A", priority: "urgent" });
    await createManualTicket(alpha.actor, { subject: "Two", customerName: "D", customerEmail: "d@customer.test", body: "B", priority: "low" });
    const day = new Date().toISOString().slice(0, 10);
    const report = await dashboard(alpha.actor, day, day);
    expect(report.queue.open_count).toBe(2);
    expect(report.byPriority.find((item) => item.priority === "urgent")?.count).toBe(1);
    const csv = await exportTickets(alpha.actor);
    expect(csv).toContain("KM-1001");
    const agentUser = await registerUser({ email: "noexport@example.com", name: "No Export", password });
    const invite = await createInvitation(alpha.actor, { email: "noexport@example.com", role: "agent" });
    await acceptInvitation(agentUser.userId, invite.invitePath.split("/").pop() ?? "");
    const agentActor = await loadActor(agentUser.userId, "noexport@example.com", "No Export", false, alpha.actor.organizationId);
    if (!agentActor) throw new Error("agent missing");
    await expect(exportTickets(agentActor)).rejects.toBeInstanceOf(AppError);
    await updateMember(alpha.actor, agentUser.userId, { status: "disabled" });
    expect(await loadActor(agentUser.userId, "noexport@example.com", "No Export", false, alpha.actor.organizationId)).toBeNull();
  });

  it("finds tickets by customer email and updates the customer", async () => {
    const alpha = await orgAdmin("search");
    await createManualTicket(alpha.actor, { subject: "Invoice 88", customerName: "Eve", customerEmail: "eve@customer.test", body: "Please resend", priority: "normal" });
    const found = await listTickets(alpha.actor, parseTicketQuery({ view: "all", q: "eve@customer.test" }));
    expect(found.total).toBe(1);
    expect(found.items[0]?.customer_email).toBe("eve@customer.test");
    await updateCustomer(alpha.actor, found.items[0]?.customer_id ?? "", "Eve Updated");
    await markRead(alpha.actor);
    expect(await actorFromToken(alpha.token, alpha.actor.organizationId)).toBeTruthy();
    const notes = await withAuth((client) => rows<{ id: string }>(client, "SELECT id FROM users WHERE email = $1", ["search@example.com"]));
    expect(notes).toHaveLength(1);
  });
});
