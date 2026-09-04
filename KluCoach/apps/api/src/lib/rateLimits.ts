import { config } from "../config.js";

export function aiAskRateLimitKey(req: {
  ip: string;
  authUser?: { id: string; institutionId: string | null } | null;
}) {
  const user = req.authUser;
  if (user?.id) return `ai:${user.institutionId ?? "none"}:${user.id}`;
  return `ai-ip:${req.ip}`;
}

export const productionAuthLimits = {
  login: 10,
  register: 5,
  inviteAccept: 10,
  inviteCreate: 20,
  passwordReset: 5,
  paymentStart: 10,
  importPreview: 20,
  aiAsk: 20,
  globalMax: 300,
} as const;

const testMax = 10_000;
const relaxed = config.isTest || config.nodeEnv !== "production";

export const rateLimits = {
  globalMax: relaxed ? testMax : productionAuthLimits.globalMax,
  login: { max: relaxed ? testMax : productionAuthLimits.login, timeWindow: "1 minute" as const },
  register: { max: relaxed ? testMax : productionAuthLimits.register, timeWindow: "1 minute" as const },
  inviteAccept: { max: relaxed ? testMax : productionAuthLimits.inviteAccept, timeWindow: "1 minute" as const },
  inviteCreate: { max: relaxed ? testMax : productionAuthLimits.inviteCreate, timeWindow: "1 minute" as const },
  passwordReset: { max: relaxed ? testMax : productionAuthLimits.passwordReset, timeWindow: "1 minute" as const },
  paymentStart: { max: relaxed ? testMax : productionAuthLimits.paymentStart, timeWindow: "1 minute" as const },
  importPreview: { max: relaxed ? testMax : productionAuthLimits.importPreview, timeWindow: "1 minute" as const },
  aiAsk: {
    max: relaxed ? testMax : productionAuthLimits.aiAsk,
    timeWindow: "1 minute" as const,
    hook: "preHandler" as const,
    keyGenerator: aiAskRateLimitKey,
  },
};

export function isRateLimitAllowlisted(url: string) {
  const path = url.split("?")[0];
  return path === "/health" || path === "/ready" || path.startsWith("/webhooks/");
}

/** @deprecated use isRateLimitAllowlisted */
export const isHealthPath = isRateLimitAllowlisted;
