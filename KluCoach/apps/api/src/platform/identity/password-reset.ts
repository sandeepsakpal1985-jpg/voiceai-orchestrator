import { createHash } from "node:crypto";
import { prisma } from "@klunex-edu/database";
import { config } from "../../config.js";
import { hashPassword } from "./password.js";
import { hashToken, newToken } from "./session.js";
import { emailProvider } from "../communication/notify.js";
import { writeSystemAudit } from "../audit/write.js";

const RESET_TTL_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = "If the account exists, a reset link has been sent.";

const devTokens = new Map<string, string>();

export function peekDevResetToken(email: string) {
  return devTokens.get(email.toLowerCase()) ?? null;
}

export async function requestPasswordReset(email: string, ip?: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: normalized, status: "ACTIVE" },
  });
  await writeSystemAudit({
    action: "auth.password_reset.requested",
    entityType: "User",
    entityId: user?.id ?? null,
    institutionId: user?.institutionId ?? null,
    userId: null,
    ip,
    metadata: { found: Boolean(user) },
  });
  if (!user?.passwordHash || !user.email) {
    return { message: GENERIC_MESSAGE };
  }
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = newToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  if (config.allowDevResetToken && !config.isProduction) {
    devTokens.set(normalized, token);
  }
  const resetUrl = `${config.publicAppUrl}/reset-password?token=${token}`;
  await emailProvider.send({
    to: user.email,
    title: "Reset your KluCoach password",
    text: `Use this link to reset your password. It expires in one hour and can be used once.\n\n${resetUrl}\n`,
  });
  return { message: GENERIC_MESSAGE };
}

export async function completePasswordReset(token: string, password: string, ip?: string) {
  const tokenHash = hashToken(token);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.user.status !== "ACTIVE") {
    return { ok: false as const };
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId: row.userId } });
  });
  if (row.user.email) devTokens.delete(row.user.email.toLowerCase());
  await writeSystemAudit({
    action: "auth.password_reset.completed",
    entityType: "User",
    entityId: row.userId,
    institutionId: row.user.institutionId,
    userId: row.userId,
    ip,
    metadata: {},
  });
  return { ok: true as const };
}

export function resetTokenFingerprint(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}
