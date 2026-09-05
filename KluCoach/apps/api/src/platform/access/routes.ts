import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { unauthorized, validationError } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { writeAudit } from "../audit/write.js";
import { studentInTenant } from "../tenancy/scope.js";
import { assertMovementAdmin, assertMovementStudentAccess } from "./authorize.js";
import { adminPunch, ingestScan, listStudentMovement, listTodayMovement } from "./service.js";

export async function accessRoutes(app: FastifyInstance) {
  app.post("/access/ingest", async (req) => {
    const deviceIdHeader = req.headers["x-access-device-id"];
    const secretHeader = req.headers["x-access-device-secret"];
    const deviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;
    const deviceSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
    if (!deviceId || !deviceSecret) throw unauthorized();
    const body = (req.body as { uid?: string; type?: string; occurredAt?: string }) ?? {};
    if (!body.uid) throw validationError("uid required");
    const requested = body.type === "ENTRY" || body.type === "EXIT" ? body.type : undefined;
    return ingestScan({
      deviceId,
      deviceSecret,
      uid: body.uid,
      requestedType: requested,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
  });

  app.get("/students/:id/movement", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "students:read");
    const { id } = req.params as { id: string };
    await assertMovementStudentAccess(tenant, id);
    return listStudentMovement(tenant.institutionId, id);
  });

  app.get("/access/today", async (req) => {
    const tenant = requireTenant(req);
    assertMovementAdmin(tenant);
    return listTodayMovement(tenant.institutionId);
  });

  app.get("/access/gates", async (req) => {
    const tenant = requireTenant(req);
    assertMovementAdmin(tenant);
    return prisma.accessGate.findMany({
      where: { institutionId: tenant.institutionId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, status: true },
    });
  });

  app.post("/access/punch", async (req) => {
    const tenant = requireTenant(req);
    assertMovementAdmin(tenant);
    const body = (req.body as { studentId?: string; gateId?: string; type?: string }) ?? {};
    if (!body.studentId || !body.gateId) throw validationError("studentId and gateId required");
    if (body.type !== "ENTRY" && body.type !== "EXIT") throw validationError("type must be ENTRY or EXIT");
    await studentInTenant(tenant.institutionId, body.studentId);
    const institution = await prisma.institution.findFirst({
      where: { id: tenant.institutionId },
      select: { name: true },
    });
    const result = await adminPunch({
      institutionId: tenant.institutionId,
      institutionName: institution?.name ?? "Institute",
      studentId: body.studentId,
      gateId: body.gateId,
      type: body.type,
    });
    await writeAudit(req, "movement.admin_punch", "MovementEvent", result.eventId, { type: result.type });
    return result;
  });
}
