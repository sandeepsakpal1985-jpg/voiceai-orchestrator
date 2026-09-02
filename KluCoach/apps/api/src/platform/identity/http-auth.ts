import type { User, UserRole } from "@klunex-edu/database";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CSRF_HEADER, SESSION_COOKIE } from "@klunex-edu/shared";
import { forbidden, unauthorized } from "../../lib/errors.js";
import { can, type Permission } from "./policies.js";
import { loadSession } from "./session.js";

export type AuthUser = Pick<
  User,
  "id" | "institutionId" | "email" | "firstName" | "lastName" | "role" | "status"
>;

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
    csrfToken: string | null;
  }
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export async function bindSession(req: FastifyRequest) {
  req.authUser = null;
  req.csrfToken = null;
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return;
  const session = await loadSession(token);
  if (!session) return;
  req.authUser = session.user;
  req.csrfToken = session.csrfToken;
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.authUser) throw unauthorized();
  return req.authUser;
}

export function requireTenant(req: FastifyRequest): AuthUser & { institutionId: string } {
  const user = requireUser(req);
  if (!user.institutionId) throw forbidden("Tenant context required");
  return user as AuthUser & { institutionId: string };
}

export function requireSuperAdmin(req: FastifyRequest): AuthUser {
  const user = requireUser(req);
  if (user.role !== "SUPER_ADMIN") throw forbidden();
  return user;
}

export function requirePermission(req: FastifyRequest, permission: Permission): AuthUser {
  const user = requireUser(req);
  if (!can(user.role as UserRole, permission)) throw forbidden();
  return user;
}

export function assertCsrf(req: FastifyRequest) {
  if (SAFE.has(req.method)) return;
  if (req.url.startsWith("/auth/login") || req.url.startsWith("/auth/register") || req.url.startsWith("/auth/invitations/accept")) {
    return;
  }
  if (!req.authUser) return;
  const header = req.headers[CSRF_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !req.csrfToken || value !== req.csrfToken) {
    throw forbidden("CSRF token missing or invalid");
  }
}

export function tenantIdOf(req: FastifyRequest): string {
  return requireTenant(req).institutionId;
}
