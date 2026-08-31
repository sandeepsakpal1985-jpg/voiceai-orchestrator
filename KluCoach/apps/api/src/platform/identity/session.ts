import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@klunex-edu/database";
import { CSRF_COOKIE, SESSION_COOKIE } from "@klunex-edu/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config.js";

const SESSION_MS = config.sessionDays * 24 * 60 * 60 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string, req: FastifyRequest, reply: FastifyReply) {
  const token = newToken();
  const csrfToken = newToken();
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfToken,
      expiresAt,
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.slice(0, 300),
    },
  });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    domain: config.cookieDomain,
    expires: expiresAt,
  });
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    domain: config.cookieDomain,
    expires: expiresAt,
  });
  return { csrfToken, expiresAt };
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/", domain: config.cookieDomain });
  reply.clearCookie(CSRF_COOKIE, { path: "/", domain: config.cookieDomain });
}

export async function loadSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  return session;
}
