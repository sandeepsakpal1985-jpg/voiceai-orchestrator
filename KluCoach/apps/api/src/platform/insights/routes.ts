import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { INSIGHT_TYPES, insightSummarySchema, studentInsightListSchema } from "@klunex-edu/shared";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { writeAudit } from "../audit/write.js";
import { assertInsightAdmin, assertInsightStudentAccess } from "./authorize.js";
import { periodWindows } from "./rules.js";
import { insightThresholds } from "./detect.js";
import { runStudentInsights } from "./service.js";
import { config } from "../../config.js";

export async function insightRoutes(app: FastifyInstance) {
  app.get("/students/:id/insights", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "students:read");
    const { id } = req.params as { id: string };
    await assertInsightStudentAccess(tenant, id);
    const rows = await prisma.studentInsight.findMany({
      where: { institutionId: tenant.institutionId, studentId: id },
      orderBy: { detectedAt: "desc" },
      take: 20,
    });
    return studentInsightListSchema.parse({
      items: rows.map((row) => ({
        id: row.id,
        studentId: row.studentId,
        type: row.type,
        severity: row.severity,
        title: row.title,
        summary: row.summary,
        source: (row.source ?? {}) as Record<string, unknown>,
        detectedAt: row.detectedAt.toISOString(),
      })),
    });
  });

  app.get("/insights/summary", async (req) => {
    const tenant = requireTenant(req);
    assertInsightAdmin(tenant);
    const windows = periodWindows(new Date(), insightThresholds().periodDays);
    const grouped = await prisma.studentInsight.groupBy({
      by: ["type"],
      where: { institutionId: tenant.institutionId, detectedAt: { gte: windows.currentStart } },
      _count: { _all: true },
    });
    const byType: Record<string, number> = {};
    for (const t of INSIGHT_TYPES) byType[t] = 0;
    for (const row of grouped) byType[row.type] = row._count._all;
    return insightSummarySchema.parse({ periodKey: windows.periodKey, byType });
  });

  app.post("/insights/run", async (req) => {
    const tenant = requireTenant(req);
    assertInsightAdmin(tenant);
    const body = (req.body as { asOf?: string }) ?? {};
    const asOf = body.asOf ? new Date(body.asOf) : new Date();
    const result = await runStudentInsights({ institutionId: tenant.institutionId, asOf });
    await writeAudit(req, "insight.job.requested", "Institution", tenant.institutionId, {
      detected: result.detected,
      created: result.created,
    });
    return { ...result, aiWording: config.insightAiWording };
  });
}
