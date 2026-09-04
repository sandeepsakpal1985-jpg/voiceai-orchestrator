import type { FastifyInstance } from "fastify";
import { aiAskRequestSchema, aiAskResponseSchema, aiStatusSchema } from "@klunex-edu/shared";
import { validationError } from "../../lib/errors.js";
import { rateLimits } from "../../lib/rateLimits.js";
import { writeAudit } from "../audit/write.js";
import { requireTenant } from "../identity/http-auth.js";
import { assertAuthorizedAiBatch, assertAuthorizedAiStudent, assertAiRoleAllowed, audienceForStudentAsk } from "./authorize.js";
import {
  buildAuthorizedBatchContext,
  buildAuthorizedInstitutionContext,
  studentContextForAuthorizedId,
} from "./context.js";
import { aiEnabledNow, aiProviderNameNow, getAiProvider } from "./factory.js";
import { completeInsight } from "./service.js";

function parseMessage(body: unknown) {
  const result = aiAskRequestSchema.safeParse(body);
  if (!result.success) throw validationError(result.error.issues.map((i) => i.message).join("; "));
  return result.data.message;
}

export async function aiRoutes(app: FastifyInstance) {
  app.get("/ai/status", async (req) => {
    requireTenant(req);
    return aiStatusSchema.parse({
      enabled: aiEnabledNow(),
      provider: aiEnabledNow() ? aiProviderNameNow() : "none",
    });
  });

  app.post("/ai/students/:id/ask", { config: { rateLimit: rateLimits.aiAsk } }, async (req) => {
    const tenant = requireTenant(req);
    const { id } = req.params as { id: string };
    const message = parseMessage(req.body);
    await writeAudit(req, "ai.student_insight.requested", "Student", id, { provider: aiProviderNameNow() });
    try {
      await assertAuthorizedAiStudent(tenant, id);
      if (!aiEnabledNow()) {
        return aiAskResponseSchema.parse(await completeInsight({
          enabled: false,
          provider: null,
          audience: audienceForStudentAsk(tenant.role),
          message,
          context: {},
          citations: [],
          contextVersion: "none",
        }));
      }
      const built = await studentContextForAuthorizedId(tenant.institutionId, id);
      const result = await completeInsight({
        enabled: true,
        provider: getAiProvider(),
        audience: audienceForStudentAsk(tenant.role),
        message,
        context: built.context,
        citations: built.citations,
        contextVersion: built.contextVersion,
      });
      await writeAudit(req, "ai.student_insight.completed", "Student", id, { provider: result.provider });
      return result;
    } catch (err) {
      await writeAudit(req, "ai.student_insight.failed", "Student", id, { provider: aiProviderNameNow() });
      throw err;
    }
  });

  app.post("/ai/batches/:id/ask", { config: { rateLimit: rateLimits.aiAsk } }, async (req) => {
    const tenant = requireTenant(req);
    const { id } = req.params as { id: string };
    const message = parseMessage(req.body);
    await writeAudit(req, "ai.student_insight.requested", "Batch", id, { provider: aiProviderNameNow() });
    try {
      await assertAuthorizedAiBatch(tenant, id);
      if (!aiEnabledNow()) {
        return await completeInsight({
          enabled: false,
          provider: null,
          audience: "teacher",
          message,
          context: {},
          citations: [],
          contextVersion: "none",
        });
      }
      const built = await buildAuthorizedBatchContext(tenant.institutionId, id);
      const result = await completeInsight({
        enabled: true,
        provider: getAiProvider(),
        audience: "teacher",
        message,
        context: built.context,
        citations: built.citations,
        contextVersion: built.contextVersion,
      });
      await writeAudit(req, "ai.student_insight.completed", "Batch", id, { provider: result.provider });
      return result;
    } catch (err) {
      await writeAudit(req, "ai.student_insight.failed", "Batch", id, { provider: aiProviderNameNow() });
      throw err;
    }
  });

  app.post("/ai/institution/ask", { config: { rateLimit: rateLimits.aiAsk } }, async (req) => {
    const tenant = requireTenant(req);
    const message = parseMessage(req.body);
    await writeAudit(req, "ai.student_insight.requested", "Institution", tenant.institutionId, { provider: aiProviderNameNow() });
    try {
      assertAiRoleAllowed(tenant, "institution");
      if (!aiEnabledNow()) {
        return await completeInsight({
          enabled: false,
          provider: null,
          audience: "admin",
          message,
          context: {},
          citations: [],
          contextVersion: "none",
        });
      }
      const built = await buildAuthorizedInstitutionContext(tenant.institutionId);
      const result = await completeInsight({
        enabled: true,
        provider: getAiProvider(),
        audience: "admin",
        message,
        context: built.context,
        citations: built.citations,
        contextVersion: built.contextVersion,
      });
      await writeAudit(req, "ai.student_insight.completed", "Institution", tenant.institutionId, { provider: result.provider });
      return result;
    } catch (err) {
      await writeAudit(req, "ai.student_insight.failed", "Institution", tenant.institutionId, { provider: aiProviderNameNow() });
      throw err;
    }
  });
}
