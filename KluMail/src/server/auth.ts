import "server-only";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { consumeDummyPasswordCheck, hashPassword, passwordHint, passwordIsAcceptable, verifyPassword } from "@/lib/passwords";
import { isEmail, normalizeEmail } from "@/lib/email";
import { randomToken, sha256 } from "@/lib/crypto";
import type { SessionRecord } from "@/lib/types";
import { one, rows, withAuth, type Sql } from "@/server/db";

const SESSION_DAYS = 14;
const GENERIC_RESET = "If an account exists for that email, a reset link has been sent.";

type UserRow = {
  id: string;
  email: string;
  name: string;
  status: string;
  email_verified_at: Date | null;
  password_hash: string;
};

async function rateLimit(client: Sql, bucket: string, limit: number, windowSeconds: number): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const row = await one<{ count: number }>(
    client,
    `INSERT INTO rate_limit_buckets (bucket, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (bucket, window_start)
     DO UPDATE SET count = rate_limit_buckets.count + 1
     RETURNING count`,
    [bucket, windowStart.toISOString()],
  );
  if ((row?.count ?? 0) > limit) {
    throw new AppError("rate_limited", "Too many attempts. Try again later.", 429);
  }
}

async function deliverSystemEmail(client: Sql, input: { userId: string | null; email: string; subject: string; body: string; template: string }): Promise<void> {
  await client.query(
    `INSERT INTO system_emails (recipient_user_id, recipient_email, subject, body_text, template)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, input.email, input.subject, input.body, input.template],
  );
  if (!process.env.SMTP_HOST) return;
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? "587"),
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "KluMail <support@example.com>",
      to: input.email,
      subject: input.subject,
      text: input.body,
    });
  } catch (error) {
    log("error", "system email delivery failed", { template: input.template, error: error instanceof Error ? error.name : "delivery_error" });
  }
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://127.0.0.1:3000";
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) throw new AppError("validation_error", "Enter a valid email address.", 400);
  if (!passwordIsAcceptable(input.password)) throw new AppError("validation_error", passwordHint(), 400);
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("validation_error", "Enter your name.", 400);
  const passwordHash = await hashPassword(input.password);
  return withAuth(async (client) => {
    await rateLimit(client, `register:${email}`, 8, 60 * 60);
    const existing = await one<{ id: string }>(client, "SELECT id FROM users WHERE lower(email) = $1", [email]);
    if (existing) throw new AppError("conflict", "An account with that email already exists.", 409);
    const user = await one<{ id: string }>(
      client,
      `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
      [email, name],
    );
    if (!user) throw new AppError("internal_error", "Could not create the account.", 500);
    await client.query("INSERT INTO user_secrets (user_id, password_hash) VALUES ($1, $2)", [user.id, passwordHash]);
    const token = randomToken();
    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '2 days')`,
      [user.id, sha256(token)],
    );
    await deliverSystemEmail(client, {
      userId: user.id,
      email,
      subject: "Verify your KluMail email",
      template: "verify-email",
      body: `Confirm your email: ${appUrl()}/verify-email?token=${token}`,
    });
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'user.registered', 'user', $2, '{}'::jsonb)`,
      [user.id, user.id],
    );
    return { userId: user.id };
  });
}

export async function loginUser(input: { email: string; password: string; userAgent?: string; ip?: string }): Promise<{ token: string; user: SessionRecord }> {
  const email = normalizeEmail(input.email);
  return withAuth(async (client) => {
    await rateLimit(client, `login:${email}`, 8, 15 * 60);
    const user = await one<UserRow>(
      client,
      `SELECT u.id, u.email, u.name, u.status, u.email_verified_at, s.password_hash
       FROM users u JOIN user_secrets s ON s.user_id = u.id
       WHERE lower(u.email) = $1`,
      [email],
    );
    if (!user) {
      await consumeDummyPasswordCheck(input.password);
      throw new AppError("invalid_credentials", "Email or password is incorrect.", 401);
    }
    const matches = await verifyPassword(input.password, user.password_hash);
    if (!matches) throw new AppError("invalid_credentials", "Email or password is incorrect.", 401);
    if (user.status !== "active") throw new AppError("account_disabled", "This account is disabled.", 403);
    const token = randomToken();
    await client.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
      [user.id, sha256(token), String(SESSION_DAYS), input.userAgent ?? null, input.ip ?? null],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'user.login', 'user', $2, '{}'::jsonb)`,
      [user.id, user.id],
    );
    return {
      token,
      user: {
        userId: user.id,
        email: user.email,
        name: user.name,
        emailVerified: Boolean(user.email_verified_at),
        status: user.status,
      },
    };
  });
}

export async function logoutUser(token: string | undefined): Promise<void> {
  if (!token) return;
  await withAuth(async (client) => {
    await client.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [sha256(token)]);
  });
}

export async function getSession(token: string | undefined): Promise<SessionRecord | null> {
  if (!token) return null;
  return withAuth(async (client) => {
    const row = await one<{ id: string; email: string; name: string; status: string; email_verified_at: Date | null }>(
      client,
      `SELECT u.id, u.email, u.name, u.status, u.email_verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`,
      [sha256(token)],
    );
    if (!row) return null;
    return { userId: row.id, email: row.email, name: row.name, status: row.status, emailVerified: Boolean(row.email_verified_at) };
  });
}

export async function requestPasswordReset(emailInput: string): Promise<{ message: string }> {
  const email = normalizeEmail(emailInput);
  if (!isEmail(email)) return { message: GENERIC_RESET };
  await withAuth(async (client) => {
    await rateLimit(client, `reset:${email}`, 5, 60 * 60);
    const user = await one<{ id: string }>(client, "SELECT id FROM users WHERE lower(email) = $1 AND status = 'active'", [email]);
    if (!user) {
      await consumeDummyPasswordCheck("unused");
      return;
    }
    const token = randomToken();
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
      [user.id, sha256(token)],
    );
    await deliverSystemEmail(client, {
      userId: user.id,
      email,
      subject: "Reset your KluMail password",
      template: "password-reset",
      body: `Reset your password: ${appUrl()}/reset-password?token=${token}`,
    });
  });
  return { message: GENERIC_RESET };
}

export async function resetPassword(token: string, password: string): Promise<void> {
  if (!passwordIsAcceptable(password)) throw new AppError("validation_error", passwordHint(), 400);
  const passwordHash = await hashPassword(password);
  await withAuth(async (client) => {
    const row = await one<{ id: string; user_id: string }>(
      client,
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [sha256(token)],
    );
    if (!row) throw new AppError("invalid_token", "This reset link is invalid or has expired.", 400);
    await client.query("UPDATE user_secrets SET password_hash = $2, updated_at = now() WHERE user_id = $1", [row.user_id, passwordHash]);
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [row.id]);
    await client.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [row.user_id]);
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await withAuth(async (client) => {
    const row = await one<{ id: string; user_id: string }>(
      client,
      `SELECT id, user_id FROM email_verification_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [sha256(token)],
    );
    if (!row) throw new AppError("invalid_token", "This verification link is invalid or has expired.", 400);
    await client.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [row.user_id]);
    await client.query("UPDATE email_verification_tokens SET used_at = now() WHERE id = $1", [row.id]);
  });
}

export async function updateProfile(userId: string, input: { name?: string; currentPassword?: string; newPassword?: string }): Promise<void> {
  if (input.name !== undefined && input.name.trim().length < 2) {
    throw new AppError("validation_error", "Enter your name.", 400);
  }
  let nextHash: string | null = null;
  if (input.newPassword) {
    if (!passwordIsAcceptable(input.newPassword)) throw new AppError("validation_error", passwordHint(), 400);
    if (!input.currentPassword) throw new AppError("validation_error", "Enter your current password.", 400);
    await withAuth(async (client) => {
      const secret = await one<{ password_hash: string }>(client, "SELECT password_hash FROM user_secrets WHERE user_id = $1", [userId]);
      if (!secret || !(await verifyPassword(input.currentPassword ?? "", secret.password_hash))) {
        throw new AppError("invalid_credentials", "The current password is incorrect.", 401);
      }
    });
    nextHash = await hashPassword(input.newPassword);
  }
  await withAuth(async (client) => {
    if (input.name) await client.query("UPDATE users SET name = $2 WHERE id = $1", [userId, input.name.trim()]);
    if (nextHash) await client.query("UPDATE user_secrets SET password_hash = $2, updated_at = now() WHERE user_id = $1", [userId, nextHash]);
  });
}

export async function listDevelopmentEmails(limit = 30): Promise<{ recipient_email: string; subject: string; body_text: string; created_at: Date }[]> {
  if (process.env.APP_ENV !== "development") return [];
  return withAuth((client) =>
    rows(client, `SELECT recipient_email, subject, body_text, created_at FROM system_emails ORDER BY created_at DESC LIMIT $1`, [limit]),
  );
}
