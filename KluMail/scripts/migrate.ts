import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

function quotePassword(password: string): string {
  return password.replace(/'/g, "''");
}

function passwordOf(url: string): string {
  return decodeURIComponent(new URL(url).password);
}

async function ensureRoles(client: Client): Promise<void> {
  const app = passwordOf(process.env.DATABASE_URL ?? "");
  const worker = passwordOf(process.env.DATABASE_WORKER_URL ?? "");
  const auth = passwordOf(process.env.DATABASE_AUTH_URL ?? "");
  const roles = [
    ["klumail_app", app],
    ["klumail_worker", worker],
    ["klumail_auth", auth],
  ] as const;
  for (const [role, password] of roles) {
    await client.query(`
      DO $$ BEGIN
        CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await client.query(`ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${quotePassword(password)}'`);
  }
}

export async function migrateDatabase(connectionString: string): Promise<string[]> {
  const client = new Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await ensureRoles(client);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const existing = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
      if ((existing.rowCount ?? 0) > 0) continue;
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const admin = process.env.DATABASE_ADMIN_URL;
  const testAdmin = process.env.TEST_DATABASE_ADMIN_URL;
  if (!admin || !testAdmin) throw new Error("database admin URLs are missing; run npm run db:up");
  const devApplied = await migrateDatabase(admin);
  const testApplied = await migrateDatabase(testAdmin);
  console.log(`dev migrations applied: ${devApplied.join(", ") || "none"}`);
  console.log(`test migrations applied: ${testApplied.join(", ") || "none"}`);
}

if (process.argv[1]?.includes("migrate")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "migration failed");
    process.exit(1);
  });
}
