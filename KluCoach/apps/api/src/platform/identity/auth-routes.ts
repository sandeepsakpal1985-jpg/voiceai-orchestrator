import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import {
  acceptInvitationSchema,
  invitationCreateSchema,
  loginSchema,
  passwordResetCompleteSchema,
  passwordResetRequestSchema,
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
import { completePasswordReset, peekDevResetToken, requestPasswordReset } from "./password-reset.js";
import { rateLimits } from "../../lib/rateLimits.js";
import { config } from "../../config.js";
import { guardianInTenant, studentInTenant, teacherInTenant } from "../tenancy/scope.js";

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
          billingMode: "LIVE",
        },
      });
      if (partner) {
        const cfg = await tx.platformBillingConfig.findUnique({ where: { id: "platform" } });
        const periodEnd = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
        await tx.tenantSubscription.create({
          data: {
            institutionId: institution.id,
            planId: partner.id,
            startsAt: new Date(),
            endsAt: periodEnd,
            renewalDate: periodEnd,
            gracePeriodDays: cfg?.gracePeriodDays ?? 7,
            currency: partner.currency,
            commercialMode: partner.commercialMode,
            studentUnitPricePaise: partner.amountPaisePerStudentYear,
            klunexUnitRealizationPaise: partner.klunexSharePaise,
            partnerUnitSharePaise: partner.partnerSharePaise,
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
      await writeAudit(req, "auth.login_failed", "User", null, { reason: "invalid_credentials" });
      throw unauthorized("Invalid email or password");
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    req.authUser = user;
    const session = await createSession(user.id, req, reply);
    await writeAudit(req, "auth.login", "User", user.id);
    return { user: publicUser(user), csrfToken: session.csrfToken };
  });

  app.post("/auth/password-reset/request", { config: { rateLimit: rateLimits.passwordReset } }, async (req) => {
    const body = parse(passwordResetRequestSchema, req.body);
    return requestPasswordReset(body.email, req.ip);
  });

  app.post("/auth/password-reset/complete", { config: { rateLimit: rateLimits.passwordReset } }, async (req) => {
    const body = parse(passwordResetCompleteSchema, req.body);
    const result = await completePasswordReset(body.token, body.password, req.ip);
    if (!result.ok) throw unauthorized("Reset link is invalid or expired");
    return { ok: true };
  });

  if (config.allowDevResetToken && !config.isProduction) {
    app.get("/auth/password-reset/dev-token", async (req) => {
      const email = String((req.query as { email?: string }).email ?? "");
      const token = peekDevResetToken(email);
      if (!token) throw unauthorized();
      return { token };
    });
  }

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
    if (invite.studentId) {
      const student = await prisma.student.findFirst({
        where: { id: invite.studentId, institutionId: invite.institutionId },
      });
      if (!student) throw unauthorized("Invitation invalid or expired");
    }
    if (invite.guardianId) {
      const guardian = await prisma.guardian.findFirst({
        where: { id: invite.guardianId, institutionId: invite.institutionId },
      });
      if (!guardian) throw unauthorized("Invitation invalid or expired");
    }
    if (invite.teacherId) {
      const teacher = await prisma.teacher.findFirst({
        where: { id: invite.teacherId, institutionId: invite.institutionId },
      });
      if (!teacher) throw unauthorized("Invitation invalid or expired");
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
      if (invite.type === "PARENT" && invite.guardianId) {
        await tx.guardian.update({ where: { id: invite.guardianId }, data: { userId: created.id } });
      }
      if (invite.type === "STUDENT" && invite.studentId) {
        await tx.student.update({ where: { id: invite.studentId }, data: { userId: created.id } });
      }
      if (invite.type === "TEACHER" && invite.teacherId) {
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
    const body = parse(invitationCreateSchema, req.body);
    if (body.type === "PARENT" && !body.studentId) {
      throw validationError("studentId required for parent invitation");
    }
    if (body.studentId) await studentInTenant(user.institutionId, body.studentId);
    if (body.guardianId) await guardianInTenant(user.institutionId, body.guardianId);
    if (body.teacherId) await teacherInTenant(user.institutionId, body.teacherId);
    let guardianId = body.guardianId;
    if (body.type === "PARENT" && body.studentId && !guardianId) {
      const guardian = await prisma.guardian.create({
        data: {
          institutionId: user.institutionId,
          name: body.email?.split("@")[0] ?? "Parent",
          email: body.email?.toLowerCase(),
          phone: body.phone,
        },
      });
      await prisma.studentGuardian.create({
        data: {
          studentId: body.studentId,
          guardianId: guardian.id,
          relationship: "GUARDIAN",
          isPrimary: false,
        },
      });
      guardianId = guardian.id;
    }
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
        guardianId,
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
        body: `Invitation created for ${body.email}`,
        channels: ["IN_APP", "EMAIL"],
        email: body.email,
        dedupeKey: `GENERIC:invitation:${invite.id}`,
      });
    }
    await writeAudit(req, "invitation.create", "Invitation", invite.id, { type: body.type });
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
