import "server-only";
import { AppError } from "@/lib/errors";
import type { Actor, Priority, Role } from "@/lib/types";
import { rows, withAppUser } from "@/server/db";
import { getSession } from "@/server/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanUuid(value: string | null | undefined): string | null {
  if (!value || !UUID.test(value)) return null;
  return value;
}

type MembershipRow = {
  organization_id: string;
  role: Role;
  status: string;
  email_signature: string;
  name: string;
  timezone: string;
  org_status: string;
  default_priority: Priority;
  default_signature: string;
};

export async function loadActor(userId: string, email: string, name: string, emailVerified: boolean, orgHint: string | null): Promise<Actor | null> {
  const hinted = cleanUuid(orgHint);
  return withAppUser(userId, hinted, async (client) => {
    const memberships = await rows<MembershipRow>(
      client,
      `SELECT m.organization_id, m.role, m.status, m.email_signature, o.name, o.timezone,
              o.status AS org_status, o.default_priority, o.default_signature
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'
       ORDER BY o.name`,
      [userId],
    );
    const selected = memberships.find((item) => item.organization_id === hinted) ?? memberships[0];
    if (!selected) return null;
    const teams = await rows<{ team_id: string }>(
      client,
      `SELECT team_id FROM team_memberships WHERE user_id = $1 AND organization_id = $2`,
      [userId, selected.organization_id],
    );
    return {
      userId,
      email,
      name,
      emailVerified,
      organizationId: selected.organization_id,
      organizationName: selected.name,
      organizationStatus: selected.org_status,
      timezone: selected.timezone,
      role: selected.role,
      teamIds: teams.map((team) => team.team_id),
      defaultPriority: selected.default_priority,
      defaultSignature: selected.default_signature,
      emailSignature: selected.email_signature,
    };
  });
}

export async function actorFromToken(token: string | undefined, orgHint: string | null): Promise<Actor | null> {
  const session = await getSession(token);
  if (!session) return null;
  return loadActor(session.userId, session.email, session.name, session.emailVerified, orgHint);
}

export async function requireActor(token: string | undefined, orgHint: string | null): Promise<Actor> {
  const session = await getSession(token);
  if (!session) throw new AppError("unauthenticated", "Sign in to continue.", 401);
  const actor = await loadActor(session.userId, session.email, session.name, session.emailVerified, orgHint);
  if (!actor) throw new AppError("onboarding_required", "Create or join an organization to continue.", 409);
  return actor;
}

export async function requireUser(token: string | undefined): Promise<{ userId: string; email: string; name: string; emailVerified: boolean }> {
  const session = await getSession(token);
  if (!session) throw new AppError("unauthenticated", "Sign in to continue.", 401);
  return session;
}

export async function listOrganizations(userId: string): Promise<{ id: string; name: string; role: Role; status: string }[]> {
  return withAppUser(userId, null, (client) =>
    rows(
      client,
      `SELECT o.id, o.name, m.role, o.status
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1 AND m.status = 'active' AND o.status <> 'deleted'
       ORDER BY o.name`,
      [userId],
    ),
  );
}

export async function recordAudit(
  client: { query: SqlQuery },
  actor: Pick<Actor, "userId" | "organizationId">,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor.organizationId, actor.userId, action, entityType, entityId, JSON.stringify(metadata)],
  );
}

type SqlQuery = (text: string, params?: unknown[]) => Promise<unknown>;

export async function userByEmail(client: { query: (text: string, params?: unknown[]) => Promise<{ rows: { id: string }[] }> }, organizationId: string, email: string): Promise<string | null> {
  const result = await client.query(
    `SELECT u.id
     FROM users u
     JOIN organization_memberships m ON m.user_id = u.id
     WHERE m.organization_id = $1 AND lower(u.email) = $2 AND m.status = 'active'`,
    [organizationId, email],
  );
  return result.rows[0]?.id ?? null;
}

export async function assertActiveMember(client: { query: (text: string, params?: unknown[]) => Promise<{ rows: { id: string }[] }> }, organizationId: string, userId: string): Promise<void> {
  const result = await client.query(
    `SELECT id FROM organization_memberships WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
    [organizationId, userId],
  );
  if (!result.rows[0]) throw new AppError("invalid_assignee", "Choose an active member of this organization.", 400);
}
