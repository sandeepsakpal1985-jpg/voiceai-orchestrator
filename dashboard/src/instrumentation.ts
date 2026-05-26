/**
 * VoiceAI Dashboard — Next.js Instrumentation
 *
 * This file is picked up by Next.js at startup (experimental.instrumentationHook).
 * It registers global performance monitoring, error tracking, and graceful shutdown.
 *
 * Note: This file is compiled for both Node.js and Edge Runtime contexts.
 * Avoid any direct references to Node.js-specific APIs (process.on, process.exit,
 * process.memoryUsage, process.version) as they trigger Edge Runtime warnings.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { log } from "@/lib/monitoring";
import { checkEnvVars } from "@/lib/env-validator";

// Track if instrumentation has already been registered
let registered = false;

export async function register() {
  if (registered) return;
  registered = true;

  // Validate environment variables
  if (process.env.NODE_ENV === "production") {
    checkEnvVars();
  }

  log({
    level: "info",
    message: `Server starting — env ${process.env.NODE_ENV}`,
  });
}
