import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import {
  notificationItemSchema,
  notificationPreferencePatchSchema,
  type NotificationType,
} from "@klunex-edu/shared";
import { notFound, validationError } from "../../lib/errors.js";
import { requireTenant } from "../identity/http-auth.js";
import { writeAudit } from "../audit/write.js";
import { loadPreferences } from "./notification-service.js";

function parsePrefs(body: unknown) {
  const result = notificationPreferencePatchSchema.safeParse(body);
  if (!result.success) throw validationError(result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}

function toItem(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  studentId: string | null;
  readAt: Date | null;
  createdAt: Date;
  student: { firstName: string; lastName: string } | null;
}) {
  return notificationItemSchema.parse({
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    href: row.href,
    studentId: row.studentId,
    studentName: row.student ? `${row.student.firstName} ${row.student.lastName}` : null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/notifications/unread-count", async (req) => {
    const tenant = requireTenant(req);
    const unreadCount = await prisma.notification.count({
      where: { institutionId: tenant.institutionId, userId: tenant.id, readAt: null },
    });
    return { unreadCount };
  });

  app.get("/notification-preferences", async (req) => {
    const tenant = requireTenant(req);
    return loadPreferences(tenant.institutionId, tenant.id);
  });

  app.patch("/notification-preferences", async (req) => {
    const tenant = requireTenant(req);
    const body = parsePrefs(req.body);
    const row = await prisma.notificationPreference.upsert({
      where: { userId: tenant.id },
      create: { institutionId: tenant.institutionId, userId: tenant.id, ...body },
      update: body,
    });
    await writeAudit(req, "notification.preferences", "NotificationPreference", row.id);
    return loadPreferences(tenant.institutionId, tenant.id);
  });

  app.post("/notifications/read-all", async (req) => {
    const tenant = requireTenant(req);
    const res = await prisma.notification.updateMany({
      where: { institutionId: tenant.institutionId, userId: tenant.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  });

  app.get("/notifications", async (req) => {
    const tenant = requireTenant(req);
    const query = req.query as { page?: string; pageSize?: string; unread?: string };
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 20) || 20));
    const unreadOnly = query.unread === "1" || query.unread === "true";
    const where = {
      institutionId: tenant.institutionId,
      userId: tenant.id,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { institutionId: tenant.institutionId, userId: tenant.id, readAt: null },
      }),
    ]);
    return { items: items.map(toItem), total, page, pageSize, unreadCount };
  });

  app.get("/notifications/:id", async (req) => {
    const tenant = requireTenant(req);
    const { id } = req.params as { id: string };
    const row = await prisma.notification.findFirst({
      where: { id, institutionId: tenant.institutionId, userId: tenant.id },
      include: { student: { select: { firstName: true, lastName: true } } },
    });
    if (!row) throw notFound();
    return toItem(row);
  });

  app.post("/notifications/:id/read", async (req) => {
    const tenant = requireTenant(req);
    const { id } = req.params as { id: string };
    const row = await prisma.notification.findFirst({
      where: { id, institutionId: tenant.institutionId, userId: tenant.id },
      include: { student: { select: { firstName: true, lastName: true } } },
    });
    if (!row) throw notFound();
    const updated = await prisma.notification.update({
      where: { id: row.id },
      data: { readAt: row.readAt ?? new Date() },
      include: { student: { select: { firstName: true, lastName: true } } },
    });
    return toItem(updated);
  });
}
