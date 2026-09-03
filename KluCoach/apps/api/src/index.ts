import { buildApp } from "./app.js";
import { config, validateConfig } from "./config.js";
import { prisma } from "@klunex-edu/database";

validateConfig(config);

const app = await buildApp();
await app.listen({ host: config.host, port: config.port });
app.log.info({ port: config.port, appEnv: config.appEnv, paymentsEnabled: config.paymentsEnabled }, "klucoach api listening");

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutdown");
  try {
    await app.close();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
