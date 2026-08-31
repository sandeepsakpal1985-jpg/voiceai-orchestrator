import { prisma } from "@klunex-edu/database";
import type { NotificationChannel } from "@klunex-edu/database";

export interface NotificationProvider {
  channel: NotificationChannel;
  send(input: { to: string; title: string; body: string }): Promise<void>;
}

class InAppProvider implements NotificationProvider {
  channel = "IN_APP" as const;
  async send() {
    /* persisted separately */
  }
}

class EmailProvider implements NotificationProvider {
  channel = "EMAIL" as const;
  async send(input: { to: string; title: string; body: string }) {
    if (!process.env.SMTP_HOST) {
      console.info(JSON.stringify({ msg: "email_skipped", to: input.to, title: input.title }));
      return;
    }
    console.info(JSON.stringify({ msg: "email_queued", to: input.to, title: input.title }));
  }
}

class NotConfiguredProvider implements NotificationProvider {
  constructor(public channel: NotificationChannel) {}
  async send() {
    console.info(JSON.stringify({ msg: "channel_not_configured", channel: this.channel }));
  }
}

const providers: Record<NotificationChannel, NotificationProvider> = {
  IN_APP: new InAppProvider(),
  EMAIL: new EmailProvider(),
  SMS: new NotConfiguredProvider("SMS"),
  WHATSAPP: new NotConfiguredProvider("WHATSAPP"),
};

export async function notifyUser(opts: {
  institutionId: string;
  userId: string;
  title: string;
  body: string;
  channels?: NotificationChannel[];
  email?: string | null;
}) {
  const channels = opts.channels ?? ["IN_APP"];
  if (channels.includes("IN_APP")) {
    await prisma.notification.create({
      data: {
        institutionId: opts.institutionId,
        userId: opts.userId,
        channel: "IN_APP",
        title: opts.title,
        body: opts.body,
      },
    });
  }
  if (channels.includes("EMAIL") && opts.email) {
    await providers.EMAIL.send({ to: opts.email, title: opts.title, body: opts.body });
  }
}

export { providers };
