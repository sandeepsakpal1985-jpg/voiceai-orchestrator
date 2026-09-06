import { prisma } from "@klunex-edu/database";
import { runDueJobs } from "./jobs/runner.js";
import { config, validateConfig } from "./config.js";

validateConfig(config);

const INTERVAL_MS = 60 * 60 * 1000;

async function tick() {
  try {
    const result = await runDueJobs();
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({ msg: "jobs_tick", result: { lifecycle: result.lifecycle.skipped, reconcile: result.reconcile.skipped, insights: result.insights.skipped } }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ msg: "jobs_tick_failed", error: err instanceof Error ? err.message : "unknown" }));
  }
}

const appEnvNote = config.appEnv;
if (appEnvNote) {
  await tick();
  const timer = setInterval(tick, INTERVAL_MS);
  const shutdown = async () => {
    clearInterval(timer);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
