import { config } from "dotenv";
import { enqueueReconciliation, processAvailableJobs } from "../src/server/jobs";

config({ path: ".env.local" });

async function tick(): Promise<void> {
  await enqueueReconciliation();
  const result = await processAvailableJobs(25);
  console.log(JSON.stringify({ processed: result.processed, failed: result.failed }));
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  await tick();
  if (!once) {
    setInterval(() => {
      tick().catch((error: unknown) => {
        console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "worker failed" }));
      });
    }, 15000);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "worker failed");
  process.exit(1);
});
