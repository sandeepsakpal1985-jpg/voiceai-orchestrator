import type { FastifyInstance, FastifyRequest } from "fastify";
import { processSignedWebhook } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export async function paymentWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    const raw = typeof body === "string" ? body : Buffer.isBuffer(body) ? body.toString("utf8") : "";
    (req as FastifyRequest).rawBody = raw;
    try {
      done(null, raw ? JSON.parse(raw) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post("/webhooks/razorpay", async (req, reply) => {
    const raw =
      req.rawBody ||
      (typeof req.body === "string" ? req.body : req.body ? JSON.stringify(req.body) : "");
    const signatureHeader = req.headers["x-razorpay-signature"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    req.log.info({ provider: "razorpay", hasSignature: Boolean(signature) }, "payment_webhook_received");
    const result = await processSignedWebhook(raw, signature);
    req.log.info(
      { provider: "razorpay", statusCode: result.statusCode, result: "result" in result.body ? result.body.result : undefined },
      "payment_webhook_processed",
    );
    return reply.code(result.statusCode).send(result.body);
  });
}
