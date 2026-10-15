import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/errors";
import { assertTimeZone } from "@/lib/time";
import { isEmail, normalizeEmail } from "@/lib/email";
import { randomToken, sha256 } from "@/lib/crypto";
import { canManageMailboxes, canManageMembers, canManageOrganization, canManageTeams } from "@/lib/permissions";
import type { Actor, Priority, Role } from "@/lib/types";
import { ROLES, PRIORITIES } from "@/lib/types";
import { one, rows, withAppUser, withAuth } from "@/server/db";
import { recordAudit } from "@/server/actor";

function assertRole(role: string): Role {
  if (!ROLES.includes(role as Role)) throw new AppError("validation_error", "Choose a valid role.", 400);
  return role as Role;
}

function slugFor(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
  return `${base}-${randomToken(4).toLowerCase()}`;
}

export async function createOrganization(userId: string, input: { name: string; timezone: string }): Promise<{ id: string }> {
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("validation_error", "Enter an organization name.", 400);
  let timezone = "UTC";
  try {
    timezone = assertTimeZone(input.timezone || "UTC");
  } catch {
    throw new AppError("validation_error", "Choose a valid timezone.", 400);
  }
  return withAppUser(userId, null, async (client) => {
    const created = await one<{ id: string }>(client, "SELECT create_organization($1, $2, $3) AS id", [name, slugFor(name), timezone]);
    if (!created) throw new AppError("internal_error", "Could not create the organization.", 500);
    await recordAudit(client, { userId, organizationId: created.id }, "organization.created", "organization", created.id, { name });
    return { id: created.id };
  });
}

export async function updateOrganization(actor: Actor, input: { name?: string; timezone?: string; defaultPriority?: Priority; defaultSignature?: string }): Promise<void> {
  if (!canManageOrganization(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change these settings.", 403);
  if (input.defaultPriority && !PRIORITIES.includes(input.defaultPriority)) {
    throw new AppError("validation_error", "Choose a valid default priority.", 400);
  }
  let timezone: string | undefined;
  if (input.timezone) {
    try {
      timezone = assertTimeZone(input.timezone);
    } catch {
      throw new AppError("validation_error", "Choose a valid timezone.", 400);
    }
  }
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    await client.query(
      `UPDATE organizations
       SET name = COALESCE($2, name),
           timezone = COALESCE($3, timezone),
           default_priority = COALESCE($4, default_priority),
           default_signature = COALESCE($5, default_signature)
       WHERE id = $1`,
      [actor.organizationId, input.name?.trim() || null, timezone ?? null, input.defaultPriority ?? null, input.defaultSignature ?? null],
    );
    await recordAudit(client, actor, "organization.updated", "organization", actor.organizationId, {});
  });
}

export async function saveLogo(actor: Actor, file: { bytes: Buffer; contentType: string }): Promise<void> {
  if (!canManageOrganization(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change the logo.", 403);
  if (file.bytes.length > 512 * 1024) throw new AppError("validation_error", "Logo files must be 512 KB or smaller.", 400);
  const ext = file.contentType === "image/png" ? "png" : file.contentType === "image/jpeg" ? "jpg" : file.contentType === "image/webp" ? "webp" : "";
  if (!ext) throw new AppError("validation_error", "Use a PNG, JPEG, or WebP logo.", 400);
  const filename = `${actor.organizationId}.${ext}`;
  const directory = path.join(process.cwd(), "data", "branding");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), file.bytes);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    await client.query("UPDATE organizations SET logo_path = $2 WHERE id = $1", [actor.organizationId, filename]);
    await recordAudit(client, actor, "organization.logo_updated", "organization", actor.organizationId, {});
  });
}

export async function readLogo(actor: Actor): Promise<{ bytes: Buffer; contentType: string } | null> {
  const row = await withAppUser(actor.userId, actor.organizationId, (client) =>
    one<{ logo_path: string | null }>(client, "SELECT logo_path FROM organizations WHERE id = $1", [actor.organizationId]),
  );
  if (!row?.logo_path || row.logo_path.includes("..") || row.logo_path.includes("/") || row.logo_path.includes("\\")) return null;
  const full = path.join(process.cwd(), "data", "branding", row.logo_path);
  try {
    const bytes = await fs.readFile(full);
    const contentType = row.logo_path.endsWith(".png") ? "image/png" : row.logo_path.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export async function listMembers(actor: Actor) {
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    rows<{ id: string; email: string; name: string; role: Role; status: string }>(
      client,
      `SELECT u.id, u.email, u.name, m.role, m.status
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1
       ORDER BY u.name`,
      [actor.organizationId],
    ),
  );
}

async function assertNotLastAdmin(client: Parameters<typeof one>[0], actor: Actor, userId: string): Promise<void> {
  const target = await one<{ role: string; status: string }>(
    client,
    `SELECT role, status FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
    [actor.organizationId, userId],
  );
  if (target?.role !== "org_admin" || target.status !== "active") return;
  const others = await one<{ count: string }>(
    client,
    `SELECT count(*)::text AS count FROM organization_memberships
     WHERE organization_id = $1 AND role = 'org_admin' AND status = 'active' AND user_id <> $2`,
    [actor.organizationId, userId],
  );
  if (Number(others?.count ?? "0") === 0) {
    throw new AppError("last_admin", "Choose another administrator before changing the last one.", 409);
  }
}

export async function updateMember(actor: Actor, userId: string, input: { role?: string; status?: "active" | "disabled" }): Promise<void> {
  if (!canManageMembers(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change members.", 403);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    await assertNotLastAdmin(client, actor, userId);
    if (input.role) {
      const role = assertRole(input.role);
      await client.query(
        `UPDATE organization_memberships SET role = $3 WHERE organization_id = $1 AND user_id = $2`,
        [actor.organizationId, userId, role],
      );
    }
    if (input.status) {
      await client.query(
        `UPDATE organization_memberships SET status = $3 WHERE organization_id = $1 AND user_id = $2`,
        [actor.organizationId, userId, input.status],
      );
    }
    await recordAudit(client, actor, "member.updated", "user", userId, { role: input.role ?? null, status: input.status ?? null });
  });
}

export async function createInvitation(actor: Actor, input: { email: string; role: string; teamId?: string | null }): Promise<{ invitePath: string }> {
  if (!canManageMembers(actor.role)) throw new AppError("forbidden", "Only an organization administrator can invite people.", 403);
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) throw new AppError("validation_error", "Enter a valid email address.", 400);
  const role = assertRole(input.role);
  const token = randomToken();
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    if (input.teamId) {
      const team = await one(client, "SELECT id FROM teams WHERE id = $1 AND organization_id = $2", [input.teamId, actor.organizationId]);
      if (!team) throw new AppError("invalid_reference", "That team is not in this organization.", 400);
    }
    await client.query(
      `INSERT INTO invitations (organization_id, email, role, team_id, token_hash, expires_at, invited_by)
       VALUES ($1, $2, $3, $4, $5, now() + interval '7 days', $6)`,
      [actor.organizationId, email, role, input.teamId ?? null, sha256(token), actor.userId],
    );
    await recordAudit(client, actor, "member.invited", "invitation", email, { role });
  });
  const invitePath = `/invite/${token}`;
  await withAuth(async (client) => {
    await client.query(
      `INSERT INTO system_emails (recipient_email, subject, body_text, template)
       VALUES ($1, $2, $3, 'invitation')`,
      [email, `Join ${actor.organizationName} on KluMail`, `Accept the invitation: ${process.env.APP_URL ?? "http://127.0.0.1:3000"}${invitePath}`],
    );
  });
  return { invitePath };
}

export async function previewInvitation(token: string) {
  return withAuth(async (client) => {
    const row = await one<{ email: string; role: string; organization_name: string; expires_at: Date; accepted: boolean }>(
      client,
      "SELECT * FROM preview_invitation($1)",
      [sha256(token)],
    );
    if (!row) throw new AppError("invalid_token", "This invitation is invalid.", 404);
    return {
      email: row.email,
      role: row.role,
      organizationName: row.organization_name,
      expired: row.accepted || row.expires_at.getTime() < Date.now(),
    };
  });
}

export async function acceptInvitation(userId: string, token: string): Promise<{ organizationId: string }> {
  return withAppUser(userId, null, async (client) => {
    try {
      const row = await one<{ accept_invitation: string }>(client, "SELECT accept_invitation($1)", [sha256(token)]);
      if (!row?.accept_invitation) throw new AppError("invalid_token", "This invitation is invalid or has expired.", 400);
      return { organizationId: row.accept_invitation };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("invalid_token", "This invitation is invalid, expired, or was sent to a different email.", 400);
    }
  });
}

export async function listTeams(actor: Actor) {
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const teams = await rows<{ id: string; name: string; description: string }>(
      client,
      `SELECT id, name, description FROM teams WHERE organization_id = $1 ORDER BY name`,
      [actor.organizationId],
    );
    const members = await rows<{ team_id: string; user_id: string; name: string; email: string }>(
      client,
      `SELECT tm.team_id, tm.user_id, u.name, u.email
       FROM team_memberships tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.organization_id = $1
       ORDER BY u.name`,
      [actor.organizationId],
    );
    return teams.map((team) => ({ ...team, members: members.filter((member) => member.team_id === team.id) }));
  });
}

export async function createTeam(actor: Actor, input: { name: string; description?: string }) {
  if (!canManageTeams(actor.role)) throw new AppError("forbidden", "Only an organization administrator can create teams.", 403);
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("validation_error", "Enter a team name.", 400);
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const team = await one<{ id: string }>(
      client,
      `INSERT INTO teams (organization_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
      [actor.organizationId, name, input.description?.trim() ?? ""],
    );
    if (!team) throw new AppError("internal_error", "Could not create the team.", 500);
    await recordAudit(client, actor, "team.created", "team", team.id, { name });
    return team;
  });
}

export async function updateTeam(actor: Actor, teamId: string, input: { name?: string; description?: string }) {
  if (!canManageTeams(actor.role)) throw new AppError("forbidden", "Only an organization administrator can edit teams.", 403);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const updated = await one(
      client,
      `UPDATE teams SET name = COALESCE($3, name), description = COALESCE($4, description)
       WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [teamId, actor.organizationId, input.name?.trim() || null, input.description ?? null],
    );
    if (!updated) throw new AppError("not_found", "That team was not found.", 404);
    await recordAudit(client, actor, "team.updated", "team", teamId, {});
  });
}

export async function addTeamMember(actor: Actor, teamId: string, userId: string) {
  if (!canManageTeams(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change team membership.", 403);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    await client.query(
      `INSERT INTO team_memberships (organization_id, team_id, user_id) VALUES ($1, $2, $3)`,
      [actor.organizationId, teamId, userId],
    );
    await recordAudit(client, actor, "team.member_added", "team", teamId, { userId });
  });
}

export async function removeTeamMember(actor: Actor, teamId: string, userId: string) {
  if (!canManageTeams(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change team membership.", 403);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    await client.query(`DELETE FROM team_memberships WHERE organization_id = $1 AND team_id = $2 AND user_id = $3`, [
      actor.organizationId,
      teamId,
      userId,
    ]);
    await recordAudit(client, actor, "team.member_removed", "team", teamId, { userId });
  });
}

export async function listCategories(actor: Actor) {
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    rows(client, `SELECT id, name, parent_id, archived_at FROM categories WHERE organization_id = $1 ORDER BY name`, [actor.organizationId]),
  );
}

export async function createCategory(actor: Actor, name: string, parentId?: string | null) {
  if (!canManageOrganization(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change categories.", 403);
  const clean = name.trim();
  if (clean.length < 2) throw new AppError("validation_error", "Enter a category name.", 400);
  return withAppUser(actor.userId, actor.organizationId, async (client) => {
    const row = await one<{ id: string }>(
      client,
      `INSERT INTO categories (organization_id, name, parent_id) VALUES ($1, $2, $3) RETURNING id`,
      [actor.organizationId, clean, parentId ?? null],
    );
    return row;
  });
}

export async function archiveCategory(actor: Actor, categoryId: string) {
  if (!canManageOrganization(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change categories.", 403);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const row = await one(client, `UPDATE categories SET archived_at = now() WHERE id = $1 AND organization_id = $2 RETURNING id`, [
      categoryId,
      actor.organizationId,
    ]);
    if (!row) throw new AppError("not_found", "That category was not found.", 404);
    await recordAudit(client, actor, "category.archived", "category", categoryId, {});
  });
}

export async function listTags(actor: Actor) {
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    rows(client, `SELECT id, name, color, archived_at FROM tags WHERE organization_id = $1 ORDER BY name`, [actor.organizationId]),
  );
}

export async function createTag(actor: Actor, name: string, color = "#0c6b62") {
  if (!canManageOrganization(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change tags.", 403);
  const clean = name.trim();
  if (clean.length < 2) throw new AppError("validation_error", "Enter a tag name.", 400);
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    one(client, `INSERT INTO tags (organization_id, name, color) VALUES ($1, $2, $3) RETURNING id, name, color`, [actor.organizationId, clean, color]),
  );
}

export async function archiveTag(actor: Actor, tagId: string) {
  if (!canManageOrganization(actor.role)) throw new AppError("forbidden", "Only an organization administrator can change tags.", 403);
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    const row = await one(client, `UPDATE tags SET archived_at = now() WHERE id = $1 AND organization_id = $2 RETURNING id`, [tagId, actor.organizationId]);
    if (!row) throw new AppError("not_found", "That tag was not found.", 404);
  });
}

export async function updateSignature(actor: Actor, signature: string) {
  await withAppUser(actor.userId, actor.organizationId, async (client) => {
    await client.query(`UPDATE organization_memberships SET email_signature = $3 WHERE organization_id = $1 AND user_id = $2`, [
      actor.organizationId,
      actor.userId,
      signature.slice(0, 4000),
    ]);
  });
}

export async function listPreferences(actor: Actor) {
  return withAppUser(actor.userId, actor.organizationId, (client) =>
    rows<{ event_type: string; in_app: boolean }>(
      client,
      `SELECT event_type, in_app FROM notification_preferences WHERE organization_id = $1 AND user_id = $2`,
      [actor.organizationId, actor.userId],
    ),
  );
}

export async function setPreference(actor: Actor, eventType: string, inApp: boolean) {
  await withAppUser(actor.userId, actor.organizationId, (client) =>
    client.query(
      `INSERT INTO notification_preferences (organization_id, user_id, event_type, in_app)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, user_id, event_type) DO UPDATE SET in_app = EXCLUDED.in_app`,
      [actor.organizationId, actor.userId, eventType, inApp],
    ),
  );
}

export function mailboxAdmin(actor: Actor) {
  if (!canManageMailboxes(actor.role)) throw new AppError("forbidden", "Only an organization administrator can manage mailboxes.", 403);
}
