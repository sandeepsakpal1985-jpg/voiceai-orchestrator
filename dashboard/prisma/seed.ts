import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/voiceagent";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.sentimentAnalytic.deleteMany();
  await prisma.billingInvoice.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.crmConnection.deleteMany();
  await prisma.knowledgeDocument.deleteMany();
  await prisma.prompt.deleteMany();
  await prisma.voiceSettings.deleteMany();
  await prisma.multilingualConfig.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.verificationToken.deleteMany();

  console.log("✅ Cleaned existing data");

  // --- Plans ---
  await Promise.all([
    prisma.plan.create({
      data: {
        id: "plan-starter",
        name: "Starter",
        description: "Perfect for small businesses getting started with AI calling",
        price: 29.99,
        currency: "USD",
        interval: "month",
        apiCalls: 1000,
        minCalls: 100,
        maxCalls: 1000,
        callMinutes: 500,
        teamSeats: 1,
        features: [
          "Up to 1,000 calls/month",
          "Basic AI voice agents",
          "Email support",
          "Basic analytics",
          "Standard voices",
        ],
        active: true,
      },
    }),
    prisma.plan.create({
      data: {
        id: "plan-pro",
        name: "Professional",
        description: "For growing businesses that need advanced AI calling capabilities",
        price: 99.99,
        currency: "USD",
        interval: "month",
        apiCalls: 10000,
        minCalls: 1000,
        maxCalls: 10000,
        callMinutes: 5000,
        teamSeats: 5,
        features: [
          "Up to 10,000 calls/month",
          "Advanced AI voice agents",
          "Priority email & chat support",
          "Advanced analytics & reporting",
          "Premium voices",
          "Custom prompts",
          "CRM integration",
          "Sentiment analysis",
        ],
        active: true,
      },
    }),
    prisma.plan.create({
      data: {
        id: "plan-enterprise",
        name: "Enterprise",
        description: "For large organizations with custom AI calling requirements",
        price: 299.99,
        currency: "USD",
        interval: "month",
        apiCalls: 100000,
        minCalls: 10000,
        maxCalls: 100000,
        callMinutes: 50000,
        teamSeats: 25,
        features: [
          "Up to 100,000 calls/month",
          "Custom AI voice agents",
          "Dedicated account manager",
          "Real-time monitoring dashboard",
          "Custom voice cloning",
          "Multilingual support",
          "API access & webhooks",
          "SSO & advanced security",
          "99.99% SLA guarantee",
        ],
        active: true,
      },
    }),
  ]);

  console.log("✅ Created plans");

  // --- Users ---
  const passwordHash = await hash("password123", 12);

  await Promise.all([
    prisma.user.create({
      data: {
        id: "user-demo",
        name: "Demo User",
        email: "demo@example.com",
        passwordHash,
        role: "USER",
        companyName: "Demo Corp",
        phone: "+12025551234",
        timezone: "America/New_York",
        emailVerified: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        id: "user-admin",
        name: "Admin User",
        email: "admin@example.com",
        passwordHash,
        role: "ADMIN",
        companyName: "Admin Corp",
        phone: "+12025555678",
        timezone: "UTC",
        emailVerified: new Date(),
      },
    }),
  ]);

  console.log("✅ Created users");

  const demoUserId = "user-demo";
  const adminUserId = "user-admin";

  // --- Subscriptions ---
  await Promise.all([
    prisma.subscription.create({
      data: {
        userId: demoUserId,
        planId: "plan-pro",
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      },
    }),
    prisma.subscription.create({
      data: {
        userId: adminUserId,
        planId: "plan-enterprise",
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      },
    }),
  ]);

  console.log("✅ Created subscriptions");

  // --- API Keys ---
  await Promise.all([
    prisma.apiKey.create({
      data: {
        name: "Production API Key",
        key: "vai_prod_abc123def456",
        userId: demoUserId,
        lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000),
        active: true,
      },
    }),
    prisma.apiKey.create({
      data: {
        name: "Development API Key",
        key: "vai_dev_xyz789uvw012",
        userId: demoUserId,
        lastUsed: new Date(Date.now() - 24 * 60 * 60 * 1000),
        active: true,
      },
    }),
    prisma.apiKey.create({
      data: {
        name: "Staging API Key",
        key: "vai_stg_345rst678abc",
        userId: adminUserId,
        active: true,
      },
    }),
  ]);

  console.log("✅ Created API keys");

  // --- Campaigns ---
  const campaigns = await Promise.all([
    prisma.campaign.create({
      data: {
        userId: demoUserId,
        name: "Customer Feedback Survey Q1",
        description: "Quarterly customer satisfaction survey for our top clients",
        status: "ACTIVE",
        script: "Hi {{name}}, this is {{agent}} from {{company}}. We're reaching out to get your feedback on our recent services. Would you have a few minutes to answer some quick questions?",
        voiceId: "en-US-Wavenet-D",
        language: "en-US",
        schedule: { startTime: "09:00", endTime: "17:00", timezone: "America/New_York", daysOfWeek: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
        targetList: { total: 500, uploaded: 500, valid: 485 },
        totalCalls: 342,
        completedCalls: 298,
        successRate: 87.1,
        startedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.campaign.create({
      data: {
        userId: demoUserId,
        name: "Product Launch - AI Assistant",
        description: "Outbound campaign to announce our new AI assistant product",
        status: "ACTIVE",
        script: "Hello {{name}}, great news! {{company}} has just launched our new AI-powered voice assistant. I'm calling to offer you an exclusive early access demo. Would you be interested?",
        voiceId: "en-US-Wavenet-F",
        language: "en-US",
        schedule: { startTime: "10:00", endTime: "18:00", timezone: "America/Chicago", daysOfWeek: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
        targetList: { total: 1000, uploaded: 1000, valid: 960 },
        totalCalls: 180,
        completedCalls: 156,
        successRate: 86.7,
        startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.campaign.create({
      data: {
        userId: adminUserId,
        name: "VIP Account Renewal",
        description: "Reach out to VIP accounts whose subscriptions are expiring soon",
        status: "DRAFT",
        script: "Hi {{name}}, this is {{agent}} from {{company}}. Your premium account is set to renew soon and I wanted to personally walk you through some exciting new features we've added.",
        voiceId: "en-US-Wavenet-D",
        language: "en-US",
        targetList: { total: 50, uploaded: 50, valid: 48 },
        totalCalls: 0,
        completedCalls: 0,
        successRate: null,
      },
    }),
  ]);

  console.log("✅ Created campaigns");

  const campaign1Id = campaigns[0].id;
  const campaign2Id = campaigns[1].id;

  // --- Call Logs ---
  const callStatuses = ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "FAILED", "NO_ANSWER", "BUSY"] as const;
  const sentimentLabels = ["VERY_POSITIVE", "POSITIVE", "NEUTRAL", "NEGATIVE", "VERY_NEGATIVE"] as const;
  const contactNames = [
    "Alice Johnson", "Bob Smith", "Carol Williams", "David Brown", "Eve Davis",
    "Frank Miller", "Grace Wilson", "Henry Moore", "Ivy Taylor", "Jack Anderson",
    "Karen Thomas", "Leo Jackson", "Mia White", "Noah Harris", "Olivia Martin",
    "Peter Thompson", "Quinn Garcia", "Rachel Martinez", "Sam Robinson", "Tina Clark",
  ];

  const callLogData = Array.from({ length: 50 }, (_, i) => {
    const statusIdx = i % callStatuses.length;
    const sentimentIdx = i % sentimentLabels.length;
    const completed = callStatuses[statusIdx] === "COMPLETED";
    const duration = completed ? Math.floor(Math.random() * 300) + 30 : null;
    const sentimentScore = sentimentIdx === 0 ? 0.9 : sentimentIdx === 1 ? 0.5 : sentimentIdx === 2 ? 0 : sentimentIdx === 3 ? -0.4 : -0.8;

    return {
      userId: i < 30 ? demoUserId : adminUserId,
      campaignId: i < 20 ? campaign1Id : i < 35 ? campaign2Id : null,
      contactName: contactNames[i % contactNames.length],
      contactPhone: `+1${String(2005550000 + i).padStart(10, "0")}`,
      duration,
      status: callStatuses[statusIdx],
      direction: i % 3 === 0 ? "inbound" : "outbound",
      cost: completed ? Number((Math.random() * 0.5 + 0.05).toFixed(4)) : null,
      sentiment: completed ? sentimentLabels[sentimentIdx] : null,
      sentimentScore: completed ? sentimentScore : null,
      transcript: completed
        ? `Agent: Hello, this is AI Assistant calling from Demo Corp. Am I speaking with ${contactNames[i % contactNames.length]}?\nCustomer: Yes, this is ${contactNames[i % contactNames.length]}.\nAgent: Great, thanks for taking my call! I'm reaching out because...`
        : null,
      recordingUrl: completed ? `https://storage.example.com/recordings/call_${i + 1}.mp3` : null,
      recordingDuration: duration,
      notes: completed ? `Call completed successfully. Customer was ${sentimentLabels[sentimentIdx].toLowerCase().replace("_", " ")}.` : null,
      tags: completed ? ["survey", "completed"] : ["missed"],
      startedAt: new Date(Date.now() - (i + 1) * 3 * 60 * 60 * 1000),
      endedAt: completed ? new Date(Date.now() - (i + 1) * 3 * 60 * 60 * 1000 + (duration ?? 0) * 1000) : null,
    };
  });

  await prisma.callLog.createMany({ data: callLogData });

  console.log("✅ Created call logs");

  // --- Voice Settings ---
  await Promise.all([
    prisma.voiceSettings.create({
      data: {
        userId: demoUserId,
        voiceId: "en-US-Wavenet-D",
        languageCode: "en-US",
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0,
        provider: "google",
        model: "default",
        emotion: "neutral",
      },
    }),
    prisma.voiceSettings.create({
      data: {
        userId: adminUserId,
        voiceId: "en-US-Studio-Q",
        languageCode: "en-US",
        speakingRate: 0.95,
        pitch: 0.5,
        volumeGainDb: 1.0,
        provider: "google",
        model: "studio",
        emotion: "friendly",
        customization: { emphasis: "moderate", style: "conversational" },
      },
    }),
  ]);

  console.log("✅ Created voice settings");

  // --- Multilingual Config ---
  await Promise.all([
    prisma.multilingualConfig.create({
      data: {
        userId: demoUserId,
        defaultLanguage: "en-US",
        fallbackLanguage: "en-US",
        autoDetect: true,
        supportedLanguages: ["en-US", "es-ES", "fr-FR", "de-DE"],
        translationProvider: "google",
      },
    }),
    prisma.multilingualConfig.create({
      data: {
        userId: adminUserId,
        defaultLanguage: "en-US",
        fallbackLanguage: "en-US",
        autoDetect: true,
        supportedLanguages: ["en-US", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN", "pt-BR"],
        translationProvider: "google",
      },
    }),
  ]);

  console.log("✅ Created multilingual configs");

  // --- Prompts ---
  await Promise.all([
    prisma.prompt.create({
      data: {
        userId: demoUserId,
        name: "Sales Call Script",
        content: "You are a professional sales representative calling from {{company}}. Your goal is to introduce our product {{product}} and book a demo. Be polite, listen to the customer's needs, and highlight key benefits. Keep the conversation natural and avoid sounding scripted.",
        category: "sales",
        variables: ["company", "product"],
        isActive: true,
        version: 2,
      },
    }),
    prisma.prompt.create({
      data: {
        userId: demoUserId,
        name: "Customer Support Script",
        content: "You are a helpful customer support agent. The customer is calling about {{issue}}. Listen carefully, show empathy, and provide clear solutions. If you cannot resolve the issue, escalate to a human agent.",
        category: "support",
        variables: ["issue"],
        isActive: true,
        version: 1,
      },
    }),
    prisma.prompt.create({
      data: {
        userId: demoUserId,
        name: "Survey Collection Script",
        content: "You are conducting a customer satisfaction survey for {{company}}. Ask the following questions one at a time: 1) How satisfied are you with our service on a scale of 1-10? 2) What do you like most about our service? 3) What could we improve? Thank the customer after each response.",
        category: "survey",
        variables: ["company"],
        isActive: true,
        version: 1,
      },
    }),
    prisma.prompt.create({
      data: {
        userId: adminUserId,
        name: "Appointment Reminder",
        content: "You are calling to remind {{name}} about their appointment on {{date}} at {{time}}. Confirm attendance, provide location details, and ask if they need to reschedule.",
        category: "reminders",
        variables: ["name", "date", "time"],
        isActive: true,
        version: 3,
      },
    }),
  ]);

  console.log("✅ Created prompts");

  // --- Knowledge Documents ---
  await Promise.all([
    prisma.knowledgeDocument.create({
      data: {
        userId: demoUserId,
        name: "Product FAQ v2.pdf",
        fileType: "application/pdf",
        fileSize: 245760,
        fileUrl: "https://storage.example.com/docs/product-faq-v2.pdf",
        content: "Frequently asked questions about our AI voice platform, including pricing, features, integrations, and troubleshooting.",
        status: "completed",
        tags: ["faq", "product", "onboarding"],
      },
    }),
    prisma.knowledgeDocument.create({
      data: {
        userId: demoUserId,
        name: "Support Best Practices.docx",
        fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSize: 102400,
        fileUrl: "https://storage.example.com/docs/support-best-practices.docx",
        content: "Best practices for handling customer support calls, including escalation procedures and common issue resolution steps.",
        status: "completed",
        tags: ["support", "training"],
      },
    }),
    prisma.knowledgeDocument.create({
      data: {
        userId: demoUserId,
        name: "Company Policies.pdf",
        fileType: "application/pdf",
        fileSize: 524288,
        fileUrl: "https://storage.example.com/docs/company-policies.pdf",
        content: "Official company policies including privacy policy, terms of service, and data handling procedures.",
        status: "processing",
        tags: ["policies", "legal"],
      },
    }),
    prisma.knowledgeDocument.create({
      data: {
        userId: adminUserId,
        name: "Technical Documentation.pdf",
        fileType: "application/pdf",
        fileSize: 1048576,
        fileUrl: "https://storage.example.com/docs/technical-docs.pdf",
        content: "Technical documentation for API integration, webhook setup, and advanced configuration options.",
        status: "completed",
        tags: ["technical", "api", "integration"],
      },
    }),
  ]);

  console.log("✅ Created knowledge documents");

  // --- CRM Connections ---
  await Promise.all([
    prisma.crmConnection.create({
      data: {
        userId: demoUserId,
        provider: "salesforce",
        name: "Salesforce Production",
        apiUrl: "https://mycompany.salesforce.com",
        status: "connected",
        lastSyncAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        credentials: { instanceUrl: "https://mycompany.salesforce.com", apiVersion: "v58.0" },
      },
    }),
    prisma.crmConnection.create({
      data: {
        userId: demoUserId,
        provider: "hubspot",
        name: "HubSpot CRM",
        apiUrl: "https://api.hubapi.com",
        status: "connected",
        lastSyncAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        credentials: { portalId: "12345678", apiVersion: "v3" },
      },
    }),
    prisma.crmConnection.create({
      data: {
        userId: adminUserId,
        provider: "salesforce",
        name: "Salesforce Sandbox",
        apiUrl: "https://mycompany--sandbox.salesforce.com",
        status: "disconnected",
        credentials: { instanceUrl: "https://mycompany--sandbox.salesforce.com", apiVersion: "v58.0" },
      },
    }),
  ]);

  console.log("✅ Created CRM connections");

  // --- Billing Invoices ---
  await Promise.all([
    prisma.billingInvoice.create({
      data: {
        userId: demoUserId,
        amount: 99.99,
        currency: "USD",
        status: "paid",
        description: "Professional Plan - Monthly",
        invoiceUrl: "https://billing.example.com/invoices/inv_001",
        paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        dueDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.billingInvoice.create({
      data: {
        userId: demoUserId,
        amount: 99.99,
        currency: "USD",
        status: "paid",
        description: "Professional Plan - Monthly",
        invoiceUrl: "https://billing.example.com/invoices/inv_002",
        paidAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.billingInvoice.create({
      data: {
        userId: demoUserId,
        amount: 99.99,
        currency: "USD",
        status: "pending",
        description: "Professional Plan - Monthly",
        dueDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.billingInvoice.create({
      data: {
        userId: adminUserId,
        amount: 299.99,
        currency: "USD",
        status: "paid",
        description: "Enterprise Plan - Monthly",
        invoiceUrl: "https://billing.example.com/invoices/inv_003",
        paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        dueDate: new Date(Date.now() + 27 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  console.log("✅ Created billing invoices");

  // --- Sentiment Analytics ---
  const sentimentData = Array.from({ length: 20 }, (_, i) => {
    const labels = ["VERY_POSITIVE", "POSITIVE", "NEUTRAL", "NEGATIVE", "VERY_NEGATIVE"];
    const label = labels[i % labels.length] as typeof sentimentLabels[number];
    const score = label === "VERY_POSITIVE" ? 0.85 + Math.random() * 0.15
      : label === "POSITIVE" ? 0.35 + Math.random() * 0.3
      : label === "NEUTRAL" ? -0.1 + Math.random() * 0.2
      : label === "NEGATIVE" ? -0.6 + Math.random() * -0.15
      : -0.95 + Math.random() * -0.05;

    return {
      userId: i < 12 ? demoUserId : adminUserId,
      overallLabel: label,
      overallScore: Number(score.toFixed(4)),
      segments: [
        { time: 0, label: label, score: score },
        { time: 30, label: labels[(i + 1) % 5], score: 0.5 },
      ],
      keywords: ["service", "product", "support", "pricing", "quality"].slice(0, Math.floor(Math.random() * 3) + 2),
      emotionalTone: {
        anger: Math.max(0, -score * 0.5),
        fear: Math.max(0, -score * 0.3),
        joy: Math.max(0, score * 0.7),
        sadness: Math.max(0, -score * 0.2),
        surprise: 0.1 + Math.random() * 0.3,
      },
    };
  });

  await prisma.sentimentAnalytic.createMany({ data: sentimentData });

  console.log("✅ Created sentiment analytics");
  console.log("");
  console.log("🎉 Seeding complete!");
  console.log("");
  console.log("📋 Sample logins:");
  console.log("   Demo user: demo@example.com / password123");
  console.log("   Admin:     admin@example.com / password123");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
