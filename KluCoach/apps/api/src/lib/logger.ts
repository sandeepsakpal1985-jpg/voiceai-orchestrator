import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";

export function createRequestId() {
  return randomUUID();
}

export function logError(log: FastifyBaseLogger, err: unknown, extra?: Record<string, unknown>) {
  log.error({ err, ...extra }, "request_error");
}
