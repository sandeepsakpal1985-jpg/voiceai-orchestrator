import { config } from "../config.js";

const testMax = 10_000;

export const rateLimits = {
  globalMax: config.isTest ? testMax : 300,
  login: { max: config.isTest ? testMax : 10, timeWindow: "1 minute" as const },
  register: { max: config.isTest ? testMax : 5, timeWindow: "1 minute" as const },
  inviteAccept: { max: config.isTest ? testMax : 10, timeWindow: "1 minute" as const },
  inviteCreate: { max: config.isTest ? testMax : 20, timeWindow: "1 minute" as const },
  importPreview: { max: config.isTest ? testMax : 20, timeWindow: "1 minute" as const },
};

export function isHealthPath(url: string) {
  const path = url.split("?")[0];
  return path === "/health" || path === "/ready";
}
