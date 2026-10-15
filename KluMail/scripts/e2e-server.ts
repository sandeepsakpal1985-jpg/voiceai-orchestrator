import { spawn } from "node:child_process";
import { config } from "dotenv";
import { ensureDatabase } from "./ensure-database";
import { migrateDatabase } from "./migrate";

async function main(): Promise<void> {
  await ensureDatabase();
  config({ path: ".env.local" });
  const admin = process.env.DATABASE_ADMIN_URL;
  const testAdmin = process.env.TEST_DATABASE_ADMIN_URL;
  if (!admin || !testAdmin) throw new Error("database admin URLs are missing");
  await migrateDatabase(admin);
  await migrateDatabase(testAdmin);

  const child = spawn("npx", ["next", "start", "--hostname", "127.0.0.1", "--port", "3100"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  const stop = () => child.kill("SIGTERM");
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "e2e server failed");
  process.exit(1);
});
