import { config } from "dotenv";
import { ensureDatabase } from "../scripts/ensure-database";
import { migrateDatabase } from "../scripts/migrate";

export default async function setup(): Promise<void> {
  process.env.BCRYPT_ROUNDS = "4";
  await ensureDatabase();
  config({ path: ".env.local" });
  const admin = process.env.DATABASE_ADMIN_URL;
  const testAdmin = process.env.TEST_DATABASE_ADMIN_URL;
  if (!admin || !testAdmin) throw new Error("database admin URLs are missing");
  await migrateDatabase(admin);
  await migrateDatabase(testAdmin);
}
