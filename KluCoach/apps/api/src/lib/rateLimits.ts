import { config } from "../config.js";

const testMax = 10_000;
const relaxed = config.isTest || config.nodeEnv !== "production";

export const rateLimits = {
  globalMax: relaxed ? testMax : 300,
  login: { max: relaxed ? testMax : 10, timeWindow: "1 minute" as const },
  register: { max: relaxed ? testMax : 5, timeWindow: "1 minute" as const },
  inviteAccept: { max: relaxed ? testMax : 10, timeWindow: "1 minute" as const },
  inviteCreate: { max: relaxed ? testMax : 20, timeWindow: "1 minute" as const },
  importPreview: { max: relaxed ? testMax : 20, timeWindow: "1 minute" as const },
};

export function isHealthPath(url: string) {
  const path = url.split("?")[0];
  return path === "/health" || path === "/ready";
}
