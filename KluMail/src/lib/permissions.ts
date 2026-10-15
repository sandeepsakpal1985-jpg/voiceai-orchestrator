import type { Role } from "@/lib/types";

export type TicketScope = {
  organizationId: string;
  assignedUserId: string | null;
  assignedTeamId: string | null;
};

export function canManageOrganization(role: Role): boolean {
  return role === "org_admin";
}

export function canManageMembers(role: Role): boolean {
  return role === "org_admin";
}

export function canManageTeams(role: Role): boolean {
  return role === "org_admin";
}

export function canManageMailboxes(role: Role): boolean {
  return role === "org_admin";
}

export function canExport(role: Role): boolean {
  return role === "org_admin" || role === "manager";
}

export function canAssignOthers(role: Role): boolean {
  return role === "org_admin" || role === "manager";
}

export function canMergeTickets(role: Role): boolean {
  return role === "org_admin" || role === "manager";
}

export function canBulkUpdate(role: Role): boolean {
  return role === "org_admin" || role === "manager";
}

export function canViewTicket(role: Role, userId: string, teamIds: string[], organizationId: string, ticket: TicketScope): boolean {
  if (ticket.organizationId !== organizationId) return false;
  if (role === "org_admin") return true;
  if (ticket.assignedUserId === userId) return true;
  if (ticket.assignedTeamId && teamIds.includes(ticket.assignedTeamId)) return true;
  return false;
}

export function canClaimTicket(role: Role): boolean {
  return role === "agent" || role === "manager" || role === "org_admin";
}
