import { prisma } from "@klunex-edu/database";
import type { NotificationChannel } from "@klunex-edu/database";

export interface NotificationProvider {
  channel: NotificationChannel;
  send(input: { to: string; title: string }): Promise<void>;
}

class InAppProvider implements NotificationProvider {
  channel = "IN_APP" as const;
  async send() {
    /* persisted by NotificationService */
  }
}

class EmailProvider implements NotificationProvider {
  channel = "EMAIL" as const;
  configured() {
    return Boolean(process.env.SMTP_HOST);
  }
  async send(input: { to: string; title: string }) {
    if (!this.configured()) {
      return;
    }
    console.info(JSON.stringify({ msg: "email_queued", to: input.to, title: input.title }));
  }
}

class NotConfiguredProvider implements NotificationProvider {
  constructor(public channel: NotificationChannel) {}
  async send() {
    /* SMS / WhatsApp / push are not instantiated for delivery */
  }
}

export const emailProvider = new EmailProvider();

export const providers: Record<NotificationChannel, NotificationProvider> = {
  IN_APP: new InAppProvider(),
  EMAIL: emailProvider,
  SMS: new NotConfiguredProvider("SMS"),
  WHATSAPP: new NotConfiguredProvider("WHATSAPP"),
};

/** Legacy helper used by invitation creation. Deduped per invitation. */
export async function notifyUser(opts: {
  institutionId: string;
  userId: string;
  title: string;
  body: string;
  channels?: NotificationChannel[];
  email?: string | null;
  dedupeKey?: string;
}) {
  const { deliverNotification } = await import("./notification-service.js");
  await deliverNotification({
    institutionId: opts.institutionId,
    userId: opts.userId,
    type: "GENERIC",
    title: opts.title,
    body: opts.body,
    href: "",
    dedupeKey: opts.dedupeKey ?? `GENERIC:${opts.userId}:${opts.title}`,
    email: opts.email,
    channels: (opts.channels ?? ["IN_APP"]).filter((c): c is "IN_APP" | "EMAIL" => c === "IN_APP" || c === "EMAIL"),
  });
}
