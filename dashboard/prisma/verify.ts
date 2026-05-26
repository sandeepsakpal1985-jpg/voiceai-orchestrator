import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/voiceagent" });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const [users, plans, campaigns, callLogs, prompts, invoices, sentiment] = await Promise.all([
    prisma.user.count(),
    prisma.plan.count(),
    prisma.campaign.count(),
    prisma.callLog.count(),
    prisma.prompt.count(),
    prisma.billingInvoice.count(),
    prisma.sentimentAnalytic.count(),
  ]);

  console.log("=== VERIFICATION ===");
  console.log("Users:", users);
  console.log("Plans:", plans);
  console.log("Campaigns:", campaigns);
  console.log("Call Logs:", callLogs);
  console.log("Prompts:", prompts);
  console.log("Invoices:", invoices);
  console.log("Sentiment:", sentiment);

  await prisma.$disconnect();
}

main();
