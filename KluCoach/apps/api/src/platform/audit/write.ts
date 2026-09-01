import { prisma } from "@klunex-edu/database";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "../identity/http-auth.js";

export async function writeAudit(
  req: FastifyRequest,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata: Record<string, unknown> = {},
) {
  const user = req.authUser as AuthUser | null;
  await prisma.auditLog.create({
    data: {
      institutionId: user?.institutionId ?? null,
      userId: user?.id ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      metadata: JSON.parse(JSON.stringify(metadata)) as object,
      ip: req.ip,
    },
  });
}
