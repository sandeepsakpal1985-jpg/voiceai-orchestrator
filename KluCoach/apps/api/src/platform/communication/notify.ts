import { prisma } from "@klunex-edu/database";
import type { NotificationChannel } from "@klunex-edu/database";
import { emailTransport } from "./email-transport.js";

export interface NotificationProvider {
  channel: NotificationChannel;
  send(input: { to: string; title: string; text?: string }): Promise<void>;
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
    return emailTransport.configured();
  }
  async send(input: { to: string; title: string; text?: string }) {
    await emailTransport.send(input);
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

export async function notifyInstitutionAdmins(opts: {
  institutionId: string;
  type: "INVOICE_ISSUED" | "SUBSCRIPTION_RENEWAL_DUE" | "PAYMENT_RECEIVED" | "PAYMENT_FAILED" | "SUBSCRIPTION_EXPIRED" | "GENERIC";
  title: string;
  body: string;
  href?: string;
  dedupeKey: string;
}) {
  const { deliverNotification } = await import("./notification-service.js");
  const admins = await prisma.user.findMany({
    where: { institutionId: opts.institutionId, role: "INSTITUTION_ADMIN", status: "ACTIVE" },
    select: { id: true, email: true },
  });
  for (const admin of admins) {
    await deliverNotification({
      institutionId: opts.institutionId,
      userId: admin.id,
      email: admin.email,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      href: opts.href ?? "/billing",
      dedupeKey: `${opts.dedupeKey}:${admin.id}`,
      channels: ["IN_APP", "EMAIL"],
    });
  }
}
