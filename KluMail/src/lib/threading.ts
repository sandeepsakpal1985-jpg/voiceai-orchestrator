export type ThreadDecision = {
  ticketId: string | null;
  strategy: "provider_thread" | "headers" | "referenced_by_existing" | "new";
};

export function referencedMessageIds(inReplyTo?: string | null, referencesHeader?: string | null): string[] {
  const raw = `${inReplyTo ?? ""} ${referencesHeader ?? ""}`;
  const ids = raw.match(/<[^<>\s]+>/g) ?? [];
  return [...new Set(ids.map((id) => id.trim()))];
}

export function decideThread(input: {
  providerThreadTicketId: string | null;
  headerTicketId: string | null;
  referencingTicketId: string | null;
}): ThreadDecision {
  if (input.providerThreadTicketId) return { ticketId: input.providerThreadTicketId, strategy: "provider_thread" };
  if (input.headerTicketId) return { ticketId: input.headerTicketId, strategy: "headers" };
  if (input.referencingTicketId) return { ticketId: input.referencingTicketId, strategy: "referenced_by_existing" };
  return { ticketId: null, strategy: "new" };
}

export function shouldSkipIngestion(input: { existingProviderId: boolean; existingHeader: boolean; existingAppMessageId: boolean }): boolean {
  return input.existingProviderId || input.existingHeader || input.existingAppMessageId;
}

export function notificationDedupeKey(type: string, ticketOrMailboxId: string, userId: string, eventId: string): string {
  return `${type}:${ticketOrMailboxId}:${userId}:${eventId}`;
}
