import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { mapDatabaseError } from "@/lib/errors";
import { log } from "@/lib/logger";

export type Sql = PoolClient;

const pools = new Map<string, Pool>();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function poolFor(name: string): Pool {
  const url = requireEnv(name);
  let pool = pools.get(url);
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 8000 });
    pools.set(url, pool);
  }
  return pool;
}

async function withPool<T>(envName: string, settings: Record<string, string>, fn: (client: Sql) => Promise<T>): Promise<T> {
  const client = await poolFor(envName).connect();
  try {
    await client.query("BEGIN");
    for (const [key, value] of Object.entries(settings)) {
      await client.query("SELECT set_config($1, $2, true)", [key, value]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      log("error", "rollback failed", { error: rollbackError instanceof Error ? rollbackError.message : "rollback error" });
    }
    throw mapDatabaseError(error);
  } finally {
    client.release();
  }
}

export function withAppUser<T>(userId: string, organizationId: string | null, fn: (client: Sql) => Promise<T>): Promise<T> {
  const settings: Record<string, string> = { "app.user_id": userId };
  if (organizationId) settings["app.organization_id"] = organizationId;
  return withPool("DATABASE_URL", settings, fn);
}

export function withWorkerOrg<T>(organizationId: string, fn: (client: Sql) => Promise<T>): Promise<T> {
  return withPool("DATABASE_WORKER_URL", { "app.organization_id": organizationId }, fn);
}

export function withWorker<T>(fn: (client: Sql) => Promise<T>): Promise<T> {
  return withPool("DATABASE_WORKER_URL", {}, fn);
}

export function withAuth<T>(fn: (client: Sql) => Promise<T>): Promise<T> {
  return withPool("DATABASE_AUTH_URL", {}, fn);
}

export async function queryAuth<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  return withAuth(async (client) => {
    const result = await client.query<T>(text, params);
    return result.rows;
  });
}

export async function rows<T extends QueryResultRow>(client: Sql, text: string, params: unknown[] = []): Promise<T[]> {
  const result = await client.query<T>(text, params);
  return result.rows;
}

export async function one<T extends QueryResultRow>(client: Sql, text: string, params: unknown[] = []): Promise<T | null> {
  const result = await rows<T>(client, text, params);
  return result[0] ?? null;
}

export async function checkDatabaseRole(): Promise<{ ok: boolean; role: string; superuser: boolean }> {
  const client = await poolFor("DATABASE_URL").connect();
  try {
    const result = await client.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    const row = result.rows[0];
    if (!row) return { ok: false, role: "unknown", superuser: true };
    const superuser = row.rolsuper || row.rolbypassrls;
    return { ok: !superuser, role: row.current_user, superuser };
  } finally {
    client.release();
  }
}

export async function closePools(): Promise<void> {
  await Promise.all([...pools.values()].map((pool) => pool.end()));
  pools.clear();
}
