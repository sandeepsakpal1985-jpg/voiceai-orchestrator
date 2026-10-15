import { config } from "dotenv";
import { loginUser, registerUser } from "../src/server/auth";
import { loadActor } from "../src/server/actor";
import { closePools } from "../src/server/db";
import { createManualTicket } from "../src/server/tickets";
import { createOrganization, createTeam } from "../src/server/workspace";

config({ path: ".env.local" });

async function main(): Promise<void> {
  if (process.env.APP_ENV === "production") {
    throw new Error("Refusing to seed a production environment.");
  }
  if (process.env.SEED_DEMO !== "true") {
    console.log("Set SEED_DEMO=true to insert labeled development records.");
    return;
  }

  const password = process.env.SEED_PASSWORD || "demo-password-1";
  const email = "demo.admin@klumail.local";
  const registered = await registerUser({ email, name: "Demo Admin", password }).catch(async () => {
    const existingSession = await loginUser({ email, password });
    return { userId: existingSession.user.userId };
  });
  const session = await loginUser({ email, password });
  const existing = await loadActor(session.user.userId, session.user.email, session.user.name, session.user.emailVerified, null);
  const organizationId = existing?.organizationId ?? (await createOrganization(registered.userId, { name: "Demo Organization (simulated)", timezone: "UTC" })).id;
  const actor = await loadActor(session.user.userId, session.user.email, session.user.name, session.user.emailVerified, organizationId);
  if (!actor) throw new Error("demo actor missing");
  if (!existing) {
    await createTeam(actor, { name: "Demo Support", description: "Simulated development team" });
    await createManualTicket(actor, {
      subject: "[SIMULATED] Welcome ticket",
      customerEmail: "demo.customer@example.com",
      customerName: "Simulated Customer",
      body: "This record was created by the development seed and is not a live customer email.",
      priority: "normal",
    });
  }
  console.log("Development seed is ready. Sign in as demo.admin@klumail.local");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "seed failed");
    process.exitCode = 1;
  })
  .finally(() => closePools());
