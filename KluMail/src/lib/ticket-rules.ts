import type { TicketStatus } from "@/lib/types";

export const STATUS_MEANING: Record<TicketStatus, string> = {
  open: "New or reopened work that has not been picked up.",
  in_progress: "An agent is actively handling the ticket.",
  pending: "Waiting on the customer or an external party. The ticket is not resolved.",
  resolved: "A solution was provided. The customer may still reply and reopen it.",
  closed: "The conversation is finished. Reopen it before sending another reply.",
};

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "pending", "resolved", "closed"],
  in_progress: ["open", "pending", "resolved", "closed"],
  pending: ["open", "in_progress", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function nextTimestamps(
  from: TicketStatus,
  to: TicketStatus,
  now: Date,
  current: { resolvedAt: Date | null; closedAt: Date | null },
): { resolvedAt: Date | null; closedAt: Date | null } {
  if (from === to) return current;
  if (to === "open") return { resolvedAt: null, closedAt: null };
  if (to === "resolved") return { resolvedAt: now, closedAt: null };
  if (to === "closed") return { resolvedAt: current.resolvedAt, closedAt: now };
  return current;
}

export function priorityRank(priority: string): number {
  switch (priority) {
    case "urgent":
      return 1;
    case "high":
      return 2;
    case "normal":
      return 3;
    default:
      return 4;
  }
}
