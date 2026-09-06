import type { FastifyInstance } from "fastify";
import { requireSuperAdmin } from "../identity/http-auth.js";
import { assemblePilotMetrics } from "./metrics.js";

export async function pilotRoutes(app: FastifyInstance) {
  app.get("/pilot/metrics", async (req) => {
    requireSuperAdmin(req);
    return assemblePilotMetrics();
  });
}
