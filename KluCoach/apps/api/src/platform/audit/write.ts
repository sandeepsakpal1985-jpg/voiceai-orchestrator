import { prisma } from "@klunex-edu/database";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "../identity/http-auth.js";

export async function writeSystemAudit(input: {
  action: string;
  entityType: string;
  entityId?: string | null;
  institutionId?: string | null;
  userId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      institutionId: input.institutionId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: JSON.parse(JSON.stringify(input.metadata ?? {})) as object,
      ip: input.ip ?? null,
    },
  });
}

export async function writeAudit(
  req: FastifyRequest,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata: Record<string, unknown> = {},
) {
  const user = req.authUser as AuthUser | null;
  await writeSystemAudit({
    action,
    entityType,
    entityId,
    metadata,
    institutionId: user?.institutionId ?? null,
    userId: user?.id ?? null,
    ip: req.ip,
  });
}
