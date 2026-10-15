import { describe, expect, it } from "vitest";
import { canTransition, nextTimestamps, priorityRank } from "@/lib/ticket-rules";
import { canAssignOthers, canClaimTicket, canExport, canViewTicket } from "@/lib/permissions";
import { attachmentAllowed, normalizeEmail, normalizeSubject, stripHtmlToText } from "@/lib/email";
import { decideThread, notificationDedupeKey, referencedMessageIds, shouldSkipIngestion } from "@/lib/threading";
import { parseMentions } from "@/lib/mentions";
import { parseTicketQuery } from "@/lib/filters";
import { fillDailySeries, zonedDayKey } from "@/lib/time";
import { sanitizeEmailHtml } from "@/lib/html";
import { decryptString, encryptString, sha256 } from "@/lib/crypto";
import { passwordIsAcceptable } from "@/lib/passwords";
import { originMatchesRequest } from "@/lib/origin";
import { sumCounts } from "@/lib/dashboard";

const key = Buffer.alloc(32, 7).toString("base64");

describe("ticket rules", () => {
  it("allows a defined lifecycle and treats the same status as a no-op", () => {
    expect(canTransition("open", "pending")).toBe(true);
    expect(canTransition("resolved", "open")).toBe(true);
    expect(canTransition("closed", "pending")).toBe(false);
    expect(canTransition("pending", "pending")).toBe(true);
  });

  it("records resolution and closure timestamps independently", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const resolved = nextTimestamps("open", "resolved", now, { resolvedAt: null, closedAt: null });
    expect(resolved.resolvedAt).toEqual(now);
    expect(resolved.closedAt).toBeNull();
    const reopened = nextTimestamps("resolved", "open", new Date("2026-01-02T00:00:00Z"), resolved);
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.closedAt).toBeNull();
  });

  it("ranks urgent work ahead of low work", () => {
    expect(priorityRank("urgent")).toBeLessThan(priorityRank("low"));
  });
});

describe("permissions", () => {
  const organizationId = "org";
  it("keeps unassigned tickets without a team visible to administrators", () => {
    const ticket = { organizationId, assignedUserId: null, assignedTeamId: null };
    expect(canViewTicket("agent", "agent", [], organizationId, ticket)).toBe(false);
    expect(canViewTicket("org_admin", "admin", [], organizationId, ticket)).toBe(true);
    expect(canViewTicket("agent", "agent", ["team"], "other-org", { ...ticket, assignedTeamId: "team" })).toBe(false);
  });

  it("lets agents claim work and keeps export with managers", () => {
    expect(canClaimTicket("agent")).toBe(true);
    expect(canAssignOthers("agent")).toBe(false);
    expect(canAssignOthers("manager")).toBe(true);
    expect(canViewTicket("manager", "manager", ["team"], organizationId, { organizationId, assignedUserId: "agent", assignedTeamId: "team" })).toBe(true);
    expect(canExport("agent")).toBe(false);
    expect(canExport("manager")).toBe(true);
  });
});

describe("email and threading", () => {
  it("normalizes addresses and subjects", () => {
    expect(normalizeEmail(" Agent@Example.com ")).toBe("agent@example.com");
    expect(normalizeSubject("Re: Fwd: Billing")).toBe("Billing");
    expect(stripHtmlToText("<p>Hello <b>there</b></p>")).toContain("Hello");
    expect(attachmentAllowed("report.pdf")).toBe(true);
    expect(attachmentAllowed("run.exe")).toBe(false);
  });

  it("threads by provider id and message references, never by subject alone", () => {
    expect(referencedMessageIds("<a@x> <b@x>", "<c@x>")).toEqual(["<a@x>", "<b@x>", "<c@x>"]);
    expect(decideThread({ providerThreadTicketId: "t1", headerTicketId: "t2", referencingTicketId: null }).ticketId).toBe("t1");
    expect(decideThread({ providerThreadTicketId: null, headerTicketId: null, referencingTicketId: null })).toEqual({ ticketId: null, strategy: "new" });
    expect(decideThread({ providerThreadTicketId: null, headerTicketId: "t2", referencingTicketId: null }).strategy).toBe("headers");
  });

  it("skips known provider ids and known headers", () => {
    expect(shouldSkipIngestion({ existingProviderId: true, existingHeader: false, existingAppMessageId: false })).toBe(true);
    expect(shouldSkipIngestion({ existingProviderId: false, existingHeader: false, existingAppMessageId: false })).toBe(false);
  });
});

describe("search, time, and security helpers", () => {
  it("parses ticket filters", () => {
    const parsed = parseTicketQuery({ view: "mine", status: "open", priority: "high", page: "2" });
    expect(parsed.view).toBe("mine");
    expect(parsed.status).toEqual(["open"]);
    expect(parsed.page).toBe(2);
  });

  it("fills missing days and converts a timezone day", () => {
    const series = fillDailySeries("2026-01-01", "2026-01-02", [{ day: "2026-01-01", count: 2 }]);
    expect(series).toEqual([{ day: "2026-01-01", count: 2 }, { day: "2026-01-02", count: 0 }]);
    expect(zonedDayKey(new Date("2026-01-01T18:30:00Z"), "Asia/Kolkata")).toBe("2026-01-02");
  });

  it("removes scripts from email HTML and round-trips encrypted tokens", () => {
    expect(sanitizeEmailHtml(`<p onclick="x()">Hi</p><script>alert(1)</script>`)).not.toContain("script");
    const encrypted = encryptString("token-value", key);
    expect(decryptString(encrypted, key)).toBe("token-value");
    expect(encrypted).not.toContain("token-value");
    expect(sha256("same")).toBe(sha256("same"));
  });

  it("finds mentions and validates passwords", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseMentions(`hello @[user:${id}] and @agent@example.com`)).toEqual({ userIds: [id], emails: ["agent@example.com"] });
    expect(passwordIsAcceptable("short")).toBe(false);
    expect(passwordIsAcceptable("correct-horse-1")).toBe(true);
    expect(notificationDedupeKey("customer_reply", "ticket", "user", "m1")).toBe("customer_reply:ticket:user:m1");
    expect(originMatchesRequest(null, "127.0.0.1:3100", "http://localhost:3100/api/auth/login")).toBe(true);
    expect(originMatchesRequest("http://127.0.0.1:3100", "127.0.0.1:3100", "http://localhost:3100/api/auth/login")).toBe(true);
    expect(originMatchesRequest("http://evil.example", "127.0.0.1:3100", "http://127.0.0.1:3100/api/auth/login")).toBe(false);
    expect(originMatchesRequest("not a url", "127.0.0.1:3100", "http://127.0.0.1:3100/api/auth/login")).toBe(false);
    expect(sumCounts([{ key: "urgent", count: 1 }, { key: "low", count: 2 }])).toBe(3);
  });
});
