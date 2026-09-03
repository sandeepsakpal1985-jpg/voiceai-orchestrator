import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutSession, PaymentProvider, ProviderPaymentEvent, ProviderPaymentStatus } from "./provider.js";

export function razorpaySignature(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function signaturesMatch(expectedHex: string, provided: string) {
  const a = Buffer.from(expectedHex);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

function notesOf(entity: { notes?: Record<string, string> }) {
  return entity.notes ?? {};
}

export class RazorpayPaymentProvider implements PaymentProvider {
  name = "razorpay" as const;
  constructor(private cfg: RazorpayConfig) {}

  async createOrder(input: {
    invoiceId: string;
    institutionId: string;
    amountPaise: number;
    currency: string;
    receipt: string;
  }): Promise<CheckoutSession> {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.cfg.keyId}:${this.cfg.keySecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt.slice(0, 40),
        payment_capture: 1,
        notes: { invoiceId: input.invoiceId, institutionId: input.institutionId },
      }),
    });
    if (!res.ok) {
      throw new Error("RAZORPAY_ORDER_FAILED");
    }
    const body = (await res.json()) as { id: string; amount: number; currency: string };
    return {
      provider: "razorpay",
      orderId: body.id,
      amountPaise: body.amount,
      currency: body.currency,
      keyId: this.cfg.keyId,
      invoiceId: input.invoiceId,
    };
  }

  verifyWebhook(rawBody: string, signature: string) {
    if (!signature || !this.cfg.webhookSecret) return false;
    return signaturesMatch(razorpaySignature(rawBody, this.cfg.webhookSecret), signature);
  }

  parseEvent(payload: unknown): ProviderPaymentEvent | null {
    if (!payload || typeof payload !== "object") return null;
    const event = payload as {
      event?: string;
      payload?: {
        payment?: { entity?: Record<string, unknown> };
        refund?: { entity?: Record<string, unknown> };
      };
    };
    const type = event.event;
    if (!type) return null;
    const payment = event.payload?.payment?.entity;
    const refund = event.payload?.refund?.entity;
    if (type.startsWith("payment.") && payment) {
      const notes = notesOf(payment as { notes?: Record<string, string> });
      const status =
        type === "payment.captured" || type === "payment.authorized"
          ? "SUCCESS"
          : type === "payment.failed"
            ? "FAILED"
            : "PENDING";
      const paymentId = String(payment.id ?? "");
      return {
        providerEventId: `${type}:${paymentId}`,
        eventType: type,
        status: type === "payment.authorized" ? "PENDING" : status,
        providerPaymentId: paymentId,
        providerOrderId: payment.order_id ? String(payment.order_id) : undefined,
        amountPaise: typeof payment.amount === "number" ? payment.amount : undefined,
        currency: payment.currency ? String(payment.currency) : undefined,
        invoiceId: notes.invoiceId,
        institutionId: notes.institutionId,
      };
    }
    if (type.startsWith("refund.") && refund) {
      const refundId = String(refund.id ?? "");
      return {
        providerEventId: `${type}:${refundId}`,
        eventType: type,
        status: "REFUNDED",
        providerPaymentId: refund.payment_id ? String(refund.payment_id) : undefined,
        refundId,
        refundAmountPaise: typeof refund.amount === "number" ? refund.amount : undefined,
      };
    }
    return null;
  }

  async fetchPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentStatus | null> {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${providerPaymentId}`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${this.cfg.keyId}:${this.cfg.keySecret}`).toString("base64")}`,
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("RAZORPAY_FETCH_FAILED");
    const body = (await res.json()) as { id: string; status: string; amount: number; order_id?: string };
    const status =
      body.status === "captured" ? "SUCCESS" : body.status === "failed" ? "FAILED" : body.status === "cancelled" ? "CANCELLED" : "PENDING";
    return {
      providerPaymentId: body.id,
      status,
      amountPaise: body.amount,
      orderId: body.order_id,
    };
  }

  async refund(input: { providerPaymentId: string; amountPaise: number }) {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${input.providerPaymentId}/refund`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.cfg.keyId}:${this.cfg.keySecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ amount: input.amountPaise }),
    });
    if (!res.ok) throw new Error("RAZORPAY_REFUND_FAILED");
    const body = (await res.json()) as { id: string };
    return { refundId: body.id };
  }
}
