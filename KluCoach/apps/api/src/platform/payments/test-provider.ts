import { randomBytes } from "node:crypto";
import { razorpaySignature, signaturesMatch } from "./razorpay-provider.js";
import type { CheckoutSession, PaymentProvider, ProviderPaymentEvent, ProviderPaymentStatus } from "./provider.js";

const orders = new Map<string, CheckoutSession & { status: ProviderPaymentStatus["status"]; paymentId?: string }>();

export class TestPaymentProvider implements PaymentProvider {
  name = "test" as const;
  constructor(private webhookSecret: string) {}

  async createOrder(input: {
    invoiceId: string;
    institutionId: string;
    amountPaise: number;
    currency: string;
    receipt: string;
  }): Promise<CheckoutSession> {
    const orderId = `order_test_${randomBytes(8).toString("hex")}`;
    const session: CheckoutSession = {
      provider: "test",
      orderId,
      amountPaise: input.amountPaise,
      currency: input.currency,
      keyId: "rzp_test_local",
      invoiceId: input.invoiceId,
    };
    orders.set(orderId, { ...session, status: "PENDING" });
    return session;
  }

  verifyWebhook(rawBody: string, signature: string) {
    if (!this.webhookSecret || !signature) return false;
    return signaturesMatch(razorpaySignature(rawBody, this.webhookSecret), signature);
  }

  parseEvent(payload: unknown): ProviderPaymentEvent | null {
    if (!payload || typeof payload !== "object") return null;
    const event = payload as {
      event?: string;
      payload?: { payment?: { entity?: Record<string, unknown> }; refund?: { entity?: Record<string, unknown> } };
    };
    const payment = event.payload?.payment?.entity;
    const refund = event.payload?.refund?.entity;
    if (event.event?.startsWith("payment.") && payment) {
      const notes = (payment.notes ?? {}) as Record<string, string>;
      const paymentId = String(payment.id ?? "");
      return {
        providerEventId: `${event.event}:${paymentId}`,
        eventType: event.event,
        status: event.event === "payment.captured" ? "SUCCESS" : event.event === "payment.failed" ? "FAILED" : "PENDING",
        providerPaymentId: paymentId,
        providerOrderId: payment.order_id ? String(payment.order_id) : undefined,
        amountPaise: typeof payment.amount === "number" ? payment.amount : undefined,
        invoiceId: notes.invoiceId,
        institutionId: notes.institutionId,
      };
    }
    if (event.event?.startsWith("refund.") && refund) {
      return {
        providerEventId: `${event.event}:${String(refund.id ?? "")}`,
        eventType: event.event ?? "refund.processed",
        status: "REFUNDED",
        providerPaymentId: refund.payment_id ? String(refund.payment_id) : undefined,
        refundId: String(refund.id ?? ""),
        refundAmountPaise: typeof refund.amount === "number" ? refund.amount : undefined,
      };
    }
    return null;
  }

  async fetchPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentStatus | null> {
    for (const order of orders.values()) {
      if (order.paymentId === providerPaymentId) {
        return { providerPaymentId, status: order.status, amountPaise: order.amountPaise, orderId: order.orderId };
      }
    }
    return null;
  }

  async refund(input: { providerPaymentId: string; amountPaise: number }) {
    return { refundId: `rfnd_test_${input.providerPaymentId}_${input.amountPaise}` };
  }

  completeOrder(orderId: string, outcome: "SUCCESS" | "FAILED") {
    const order = orders.get(orderId);
    if (!order) return null;
    const paymentId = order.paymentId ?? `pay_test_${randomBytes(8).toString("hex")}`;
    order.paymentId = paymentId;
    order.status = outcome;
    return { ...order, paymentId };
  }

  hasOrder(orderId: string) {
    return orders.has(orderId);
  }
}
