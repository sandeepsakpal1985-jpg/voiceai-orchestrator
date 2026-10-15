export const ROLES = ["org_admin", "manager", "agent"] as const;
export type Role = (typeof ROLES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROVIDERS = ["gmail", "microsoft", "mock"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const MESSAGE_KINDS = ["inbound", "outbound", "internal_note"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const VIEWS = [
  "mine",
  "mine_open",
  "mine_pending",
  "team",
  "unassigned",
  "all",
  "resolved_recent",
  "updated_recent",
] as const;
export type TicketView = (typeof VIEWS)[number];

export type Actor = {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  timezone: string;
  role: Role;
  teamIds: string[];
  defaultPriority: Priority;
  defaultSignature: string;
  emailSignature: string;
};

export type SessionRecord = {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  status: string;
};

export type EmailAddress = {
  email: string;
  name?: string;
};

export type TicketQuery = {
  view: TicketView;
  status: TicketStatus[];
  priority: Priority[];
  assigneeId?: string;
  teamId?: string;
  mailboxId?: string;
  categoryId?: string;
  tagId?: string;
  q?: string;
  from?: string;
  to?: string;
  sort: "created_at" | "last_activity_at" | "priority" | "status";
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};
