import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import {
  acceptInvitationSchema,
  loginSchema,
  registerInstitutionSchema,
} from "@klunex-edu/shared";
import type { z } from "zod";
import { writeAudit } from "../audit/write.js";
import { unauthorized, validationError } from "../../lib/errors.js";
import { notifyUser } from "../communication/notify.js";
import { requireUser } from "./http-auth.js";
import { can } from "./policies.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSession, destroySession, newToken, hashToken } from "./session.js";
import { rateLimits } from "../../lib/rateLimits.js";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw validationError(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}

function slugify(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", { config: { rateLimit: rateLimits.register } }, async (req, reply) => {
    const body = parse(registerInstitutionSchema, req.body);
    const existing = await prisma.user.findFirst({
      where: { email: body.adminEmail.toLowerCase() },
    });
    if (existing) throw validationError("Email already in use");
    const passwordHash = await hashPassword(body.password);
    const partner = await prisma.subscriptionPlan.findUnique({ where: { code: "PARTNER" } });
    const result = await prisma.$transaction(async (tx) => {
      const institution = await tx.institution.create({
        data: {
          name: body.institutionName,
          displayName: body.institutionName,
          slug: slugify(body.institutionName),
          type: body.type,
          city: body.city,
          state: body.state,
        },
      });
      if (partner) {
        await tx.tenantSubscription.create({
          data: {
            institutionId: institution.id,
            planId: partner.id,
            startsAt: new Date(),
          },
        });
      }
      const year = await tx.academicYear.create({
        data: {
          institutionId: institution.id,
          name: `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`,
          startDate: new Date(`${new Date().getFullYear()}-04-01`),
          endDate: new Date(`${new Date().getFullYear() + 1}-03-31`),
          isCurrent: true,
        },
      });
      await tx.branch.create({
        data: {
          institutionId: institution.id,
          name: "Main",
          city: body.city,
          state: body.state,
        },
      });
      const user = await tx.user.create({
        data: {
          institutionId: institution.id,
          email: body.adminEmail.toLowerCase(),
          passwordHash,
          firstName: body.adminFirstName,
          lastName: body.adminLastName,
          role: "INSTITUTION_ADMIN",
        },
      });
      return { institution, user, year };
    });
    req.authUser = result.user;
    const session = await createSession(result.user.id, req, reply);
    await writeAudit(req, "institution.register", "Institution", result.institution.id);
    return reply.code(201).send({
      user: publicUser(result.user),
      institution: { id: result.institution.id, name: result.institution.name, type: result.institution.type },
      csrfToken: session.csrfToken,
    });
  });

  app.post("/auth/login", { config: { rateLimit: rateLimits.login } }, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const user = await prisma.user.findFirst({
      where: { email: body.email.toLowerCase(), status: "ACTIVE" },
    });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, body.password))) {
      await writeAudit(req, "auth.login_failed", "User", user?.id ?? null, { email: body.email });
      throw unauthorized("Invalid email or password");
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    req.authUser = user;
    const session = await createSession(user.id, req, reply);
    await writeAudit(req, "auth.login", "User", user.id);
    return { user: publicUser(user), csrfToken: session.csrfToken };
  });

  app.post("/auth/logout", async (req, reply) => {
    if (req.authUser) await writeAudit(req, "auth.logout", "User", req.authUser.id);
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const user = requireUser(req);
    const institution = user.institutionId
      ? await prisma.institution.findUnique({ where: { id: user.institutionId } })
      : null;
    return {
      user: publicUser(user),
      institution: institution
        ? { id: institution.id, name: institution.displayName ?? institution.name, type: institution.type }
        : null,
      permissions: (await import("./policies.js")).permissionsFor(user.role),
      csrfToken: req.csrfToken,
    };
  });

  app.post("/auth/invitations/accept", { config: { rateLimit: rateLimits.inviteAccept } }, async (req, reply) => {
    const body = parse(acceptInvitationSchema, req.body);
    const invite = await prisma.invitation.findUnique({
      where: { tokenHash: hashToken(body.token) },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw unauthorized("Invitation invalid or expired");
    }
    const passwordHash = await hashPassword(body.password);
    const role =
      invite.type === "PARENT"
        ? "PARENT"
        : invite.type === "STUDENT"
          ? "STUDENT"
          : invite.type === "TEACHER"
            ? "TEACHER"
            : invite.type === "STAFF"
              ? "STAFF"
              : "INSTITUTION_ADMIN";
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          institutionId: invite.institutionId,
          email: invite.email?.toLowerCase(),
          phone: invite.phone,
          passwordHash,
          firstName: body.firstName ?? "New",
          lastName: body.lastName ?? "User",
          role,
        },
      });
      if (invite.guardianId) {
        await tx.guardian.update({ where: { id: invite.guardianId }, data: { userId: created.id } });
      }
      if (invite.studentId) {
        await tx.student.update({ where: { id: invite.studentId }, data: { userId: created.id } });
      }
      if (invite.teacherId) {
        await tx.teacher.update({ where: { id: invite.teacherId }, data: { userId: created.id } });
      }
      await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return created;
    });
    req.authUser = user;
    const session = await createSession(user.id, req, reply);
    await writeAudit(req, "invitation.accept", "Invitation", invite.id);
    return { user: publicUser(user), csrfToken: session.csrfToken };
  });

  app.post("/invitations", { config: { rateLimit: rateLimits.inviteCreate } }, async (req, reply) => {
    const user = requireUser(req);
    if (!can(user.role, "invitations:write") || !user.institutionId) throw unauthorized();
    const body = req.body as {
      type: "PARENT" | "STUDENT" | "TEACHER";
      email?: string;
      phone?: string;
      studentId?: string;
      guardianId?: string;
      teacherId?: string;
    };
    const token = newToken();
    const invite = await prisma.invitation.create({
      data: {
        institutionId: user.institutionId,
        type: body.type,
        email: body.email?.toLowerCase(),
        phone: body.phone,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        studentId: body.studentId,
        guardianId: body.guardianId,
        teacherId: body.teacherId,
        invitedById: user.id,
      },
    });
    const acceptUrl = `${process.env.PUBLIC_APP_URL ?? "http://localhost:5173"}/accept-invite?token=${token}`;
    if (body.email) {
      await notifyUser({
        institutionId: user.institutionId,
        userId: user.id,
        title: "Invitation created",
        body: `Invite link for ${body.email}: ${acceptUrl}`,
        channels: ["IN_APP", "EMAIL"],
        email: body.email,
      });
    }
    await writeAudit(req, "invitation.create", "Invitation", invite.id);
    return reply.code(201).send({ id: invite.id, acceptUrl, token });
  });
}

function publicUser(user: {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  institutionId: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    institutionId: user.institutionId,
  };
}
