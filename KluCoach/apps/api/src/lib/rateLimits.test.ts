import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { describe, expect, it } from "vitest";
import { aiAskRateLimitKey, productionAuthLimits } from "./rateLimits.js";

describe("auth rate limit configuration", () => {
  it("keeps documented production ceilings", () => {
    expect(productionAuthLimits.login).toBe(10);
    expect(productionAuthLimits.register).toBe(5);
    expect(productionAuthLimits.inviteAccept).toBe(10);
    expect(productionAuthLimits.inviteCreate).toBe(20);
    expect(productionAuthLimits.passwordReset).toBe(5);
    expect(productionAuthLimits.paymentStart).toBe(10);
    expect(productionAuthLimits.aiAsk).toBe(20);
  });

  it("keys AI limits by tenant and user after the session is bound", () => {
    expect(
      aiAskRateLimitKey({
        ip: "1.1.1.1",
        authUser: { id: "user-1", institutionId: "tenant-a" },
      }),
    ).toBe("ai:tenant-a:user-1");
    expect(aiAskRateLimitKey({ ip: "2.2.2.2", authUser: null })).toBe("ai-ip:2.2.2.2");
  });

  it("returns HTTP 429 when a Fastify rate limit is exceeded", async () => {
    const app = Fastify();
    await app.register(rateLimit, { max: 1, timeWindow: "1 minute" });
    app.get("/limited", async () => ({ ok: true }));
    const first = await app.inject({ method: "GET", url: "/limited" });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "GET", url: "/limited" });
    expect(second.statusCode).toBe(429);
    await app.close();
  });
});
