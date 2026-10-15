import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const root = process.cwd();
const dataDir = path.join(root, "data", "postgres");
const envPath = path.join(root, ".env.local");
const port = "5433";

function bin(): string {
  return process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\16\\bin";
}

function run(exe: string, args: string[], allowFailure = false): string {
  const result = spawnSync(path.join(bin(), exe), args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error && !allowFailure) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${exe} failed\n${result.stderr || result.stdout}`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function passwordFrom(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    return decodeURIComponent(new URL(url).password || fallback);
  } catch {
    return fallback;
  }
}

function secret(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

function writeEnv(values: Record<string, string>): void {
  const lines = [
    "APP_ENV=development",
    "APP_URL=http://127.0.0.1:3000",
    `DATABASE_ADMIN_URL=${values.admin}`,
    `DATABASE_URL=${values.app}`,
    `DATABASE_WORKER_URL=${values.worker}`,
    `DATABASE_AUTH_URL=${values.auth}`,
    `TEST_DATABASE_ADMIN_URL=${values.testAdmin}`,
    `TEST_DATABASE_URL=${values.testApp}`,
    `TEST_DATABASE_WORKER_URL=${values.testWorker}`,
    `TEST_DATABASE_AUTH_URL=${values.testAuth}`,
    `APP_ENCRYPTION_KEY=${values.encryption}`,
    `WORKER_SECRET=${values.workerSecret}`,
    "BCRYPT_ROUNDS=12",
    "SYNC_INITIAL_DAYS=14",
    `PG_BIN=${bin()}`,
    "SEED_DEMO=false",
  ];
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, { encoding: "utf8" });
}

async function syncSuperuserPassword(adminUrl: string, password: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 8000 });
  await client.connect();
  try {
    await client.query(`ALTER ROLE klumail WITH PASSWORD '${password.replace(/'/g, "''")}'`);
  } finally {
    await client.end();
  }
}

async function ensureDatabaseExists(adminUrl: string, name: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 8000 });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${name}`);
    }
  } finally {
    await client.end();
  }
}

export async function ensureDatabase(): Promise<void> {
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  const existing = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, "utf8")) : {};
  const superPassword = passwordFrom(existing.DATABASE_ADMIN_URL, secret());
  const appPassword = passwordFrom(existing.DATABASE_URL, secret());
  const workerPassword = passwordFrom(existing.DATABASE_WORKER_URL, secret());
  const authPassword = passwordFrom(existing.DATABASE_AUTH_URL, secret());
  const encryption = existing.APP_ENCRYPTION_KEY || randomBytes(32).toString("base64");
  const workerSecret = existing.WORKER_SECRET || secret(32);

  const url = (user: string, password: string, database: string) =>
    `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;

  const values = {
    admin: url("klumail", superPassword, "klumail"),
    app: url("klumail_app", appPassword, "klumail"),
    worker: url("klumail_worker", workerPassword, "klumail"),
    auth: url("klumail_auth", authPassword, "klumail"),
    testAdmin: url("klumail", superPassword, "klumail_test"),
    testApp: url("klumail_app", appPassword, "klumail_test"),
    testWorker: url("klumail_worker", workerPassword, "klumail_test"),
    testAuth: url("klumail_auth", authPassword, "klumail_test"),
    encryption,
    workerSecret,
  };

  if (!fs.existsSync(envPath)) writeEnv(values);

  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    const pwFile = path.join(root, "data", "cluster-password.txt");
    fs.writeFileSync(pwFile, superPassword, { encoding: "utf8" });
    run("initdb.exe", ["-D", dataDir, "-U", "klumail", "-A", "scram-sha-256", `--pwfile=${pwFile}`, "--encoding=UTF8", "--locale=C"]);
    fs.rmSync(pwFile, { force: true });
  }

  const status = spawnSync(path.join(bin(), "pg_ctl.exe"), ["status", "-D", dataDir], { encoding: "utf8", windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
  if (status.status !== 0) {
    const starter = spawn(path.join(bin(), "pg_ctl.exe"), ["start", "-D", dataDir, "-l", path.join(root, "data", "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`], { detached: true, stdio: "ignore", windowsHide: true });
    starter.unref();
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const probe = spawnSync(path.join(bin(), "pg_isready.exe"), ["-h", "127.0.0.1", "-p", port], { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("local postgres did not accept connections on port 5433");
  }

  const maintenance = url("klumail", superPassword, "postgres");
  await syncSuperuserPassword(maintenance, superPassword);
  await ensureDatabaseExists(maintenance, "klumail");
  await ensureDatabaseExists(maintenance, "klumail_test");
  for (const [key, value] of Object.entries({
    DATABASE_ADMIN_URL: values.admin,
    DATABASE_URL: values.app,
    DATABASE_WORKER_URL: values.worker,
    DATABASE_AUTH_URL: values.auth,
    TEST_DATABASE_ADMIN_URL: values.testAdmin,
    TEST_DATABASE_URL: values.testApp,
    TEST_DATABASE_WORKER_URL: values.testWorker,
    TEST_DATABASE_AUTH_URL: values.testAuth,
    APP_ENCRYPTION_KEY: encryption,
    WORKER_SECRET: workerSecret,
    APP_ENV: "development",
    APP_URL: process.env.APP_URL || "http://127.0.0.1:3000",
    BCRYPT_ROUNDS: process.env.BCRYPT_ROUNDS || "4",
  })) {
    if (!process.env[key]) process.env[key] = value;
  }
}

if (process.argv[1]?.includes("ensure-database")) {
  ensureDatabase()
    .then(() => console.log("local postgres is ready"))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "database bootstrap failed");
      process.exit(1);
    });
}
