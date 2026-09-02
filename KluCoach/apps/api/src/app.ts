import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { ERROR_CODES } from "@klunex-edu/shared";
import { prisma } from "@klunex-edu/database";
import { config } from "./config.js";
import { ApiError } from "./lib/errors.js";
import { createRequestId } from "./lib/logger.js";
import { isHealthPath, rateLimits } from "./lib/rateLimits.js";
import { assertCsrf, bindSession } from "./platform/identity/http-auth.js";
import { authRoutes } from "./platform/identity/auth-routes.js";
import { peopleRoutes } from "./platform/students/people-routes.js";
import { academicsRoutes } from "./platform/academics/academics-routes.js";
import { academicWorkRoutes } from "./platform/academics/academic-work-routes.js";
import { dashboardRoutes } from "./platform/dashboard/dashboard-routes.js";
import { opsRoutes } from "./platform/ops/ops-routes.js";
import { notificationRoutes } from "./platform/communication/notification-routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ["req.headers.cookie", "req.headers.authorization"],
    },
    genReqId: createRequestId,
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: rateLimits.globalMax,
    timeWindow: "1 minute",
    skipOnError: true,
    allowList: (req) => isHealthPath(req.url),
  });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });

  app.addHook("onRequest", async (req) => {
    await bindSession(req);
    assertCsrf(req);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    req.log.error({ err }, "unhandled");
    if (status === 429) {
      return reply.code(429).send({ error: { code: ERROR_CODES.RATE_LIMIT, message: "Too many requests" } });
    }
    return reply.code(status >= 400 && status < 600 ? status : 500).send({
      error: {
        code: status === 400 ? ERROR_CODES.VALIDATION : ERROR_CODES.INTERNAL,
        message: status >= 500 ? "Internal error" : err instanceof Error ? err.message : "Request failed",
      },
    });
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  await app.register(authRoutes);
  await app.register(peopleRoutes);
  await app.register(academicsRoutes);
  await app.register(academicWorkRoutes);
  await app.register(dashboardRoutes);
  await app.register(notificationRoutes);
  await app.register(opsRoutes);

  return app;
}
