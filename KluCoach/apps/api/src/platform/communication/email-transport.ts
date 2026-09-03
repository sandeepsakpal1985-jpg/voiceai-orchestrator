import { config } from "../../config.js";

export type EmailMessage = {
  to: string;
  title: string;
  text?: string;
};

export interface EmailTransport {
  configured(): boolean;
  send(input: EmailMessage): Promise<void>;
  verify(): Promise<{ ok: boolean; error?: string }>;
}

export const emailOutbox: EmailMessage[] = [];

class MemoryEmailTransport implements EmailTransport {
  configured() {
    return true;
  }
  async send(input: EmailMessage) {
    emailOutbox.push(input);
  }
  async verify() {
    return { ok: true };
  }
}

class SmtpEmailTransport implements EmailTransport {
  configured() {
    return Boolean(config.smtpHost);
  }
  async send(input: EmailMessage) {
    if (!this.configured()) {
      emailOutbox.push(input);
      return;
    }
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    });
    await transporter.sendMail({
      from: config.smtpFrom,
      to: input.to,
      subject: input.title,
      text: input.text ?? input.title,
    });
  }
  async verify() {
    if (!this.configured()) return { ok: false, error: "SMTP_HOST is not configured" };
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
      });
      await transporter.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "SMTP verify failed" };
    }
  }
}

export function createEmailTransport(): EmailTransport {
  if (config.isTest) return new MemoryEmailTransport();
  return new SmtpEmailTransport();
}

export const emailTransport = createEmailTransport();
