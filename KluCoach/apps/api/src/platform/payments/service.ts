import { createHash } from "node:crypto";
import { prisma } from "@klunex-edu/database";
import { ERROR_CODES } from "@klunex-edu/shared";
import { config } from "../../config.js";
import { ApiError, notFound, validationError } from "../../lib/errors.js";
import { writeSystemAudit } from "../audit/write.js";
import { invoiceStatusFromPaid, outstandingPaise } from "../billing/pricing.js";
import { recordRefund } from "../billing/billing-service.js";
import { notifyInstitutionAdmins } from "../communication/notify.js";
import { getPaymentProvider, webhookSecretNow } from "./factory.js";
import { razorpaySignature } from "./razorpay-provider.js";
import { TestPaymentProvider } from "./test-provider.js";
import type { CheckoutSession, ProviderPaymentEvent } from "./provider.js";

const PAYABLE = new Set(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);

function payloadHash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function paymentsAreEnabled() {
  return process.env.PAYMENTS_ENABLED === "true" || config.paymentsEnabled;
}

export async function createInvoiceCheckout(institutionId: string, invoiceId: string, actorUserId?: string) {
  if (!paymentsAreEnabled()) {
    throw new ApiError(403, ERROR_CODES.PAYMENTS_DISABLED, "Payment collection is not enabled");
  }
  const provider = getPaymentProvider();
  if (!provider) {
    throw new ApiError(403, ERROR_CODES.PAYMENTS_DISABLED, "Payment collection is not enabled");
  }
  const invoice = await prisma.billingInvoice.findFirst({
    where: { id: invoiceId, institutionId },
  });
  if (!invoice) throw notFound();
  if (!PAYABLE.has(invoice.status)) throw validationError("Invoice is not payable");
  const due = outstandingPaise(invoice.totalPaise, invoice.paidPaise);
  if (due <= 0) throw validationError("Invoice has no outstanding balance");

  const existingPending = await prisma.billingPayment.findFirst({
    where: { invoiceId: invoice.id, status: "PENDING", provider: provider.name.toUpperCase() },
    orderBy: { createdAt: "desc" },
  });
  if (existingPending?.providerOrderId) {
    return {
      provider: provider.name,
      orderId: existingPending.providerOrderId,
      amountPaise: existingPending.amountPaise,
      currency: invoice.currency,
      keyId: provider.name === "razorpay" ? config.razorpayKeyId : "rzp_test_local",
      invoiceId: invoice.id,
    } satisfies CheckoutSession;
  }

  const session = await provider.createOrder({
    invoiceId: invoice.id,
    institutionId,
    amountPaise: due,
    currency: invoice.currency,
    receipt: invoice.invoiceNumber,
  });
  const dedupeKey = `order:${session.orderId}`;
  await prisma.billingPayment.create({
    data: {
      institutionId,
      invoiceId: invoice.id,
      amountPaise: due,
      currency: invoice.currency,
      paymentDate: new Date(),
      method: "CHECKOUT",
      status: "PENDING",
      provider: provider.name.toUpperCase(),
      providerOrderId: session.orderId,
      providerStatus: "created",
      dedupeKey,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    },
  });
  await writeSystemAudit({
    action: "billing.payment.initiated",
    entityType: "BillingInvoice",
    entityId: invoice.id,
    institutionId,
    userId: actorUserId ?? null,
    metadata: { orderId: session.orderId, amountPaise: due, provider: provider.name },
  });
  return session;
}

async function applySuccess(event: ProviderPaymentEvent) {
  const provider = getPaymentProvider();
  if (!provider) return { ok: false, reason: "provider_disabled" };
  const pending = event.providerOrderId
    ? await prisma.billingPayment.findFirst({
        where: { provider: provider.name.toUpperCase(), providerOrderId: event.providerOrderId },
      })
    : event.providerPaymentId
      ? await prisma.billingPayment.findFirst({
          where: { provider: provider.name.toUpperCase(), providerPaymentId: event.providerPaymentId },
        })
      : null;
  if (!pending) return { ok: false, reason: "payment_not_found" };
  if (pending.status === "SUCCESS") return { ok: true, duplicate: true, paymentId: pending.id, invoiceId: pending.invoiceId };
  const invoice = await prisma.billingInvoice.findFirst({
    where: { id: pending.invoiceId, institutionId: pending.institutionId },
  });
  if (!invoice) return { ok: false, reason: "invoice_not_found" };
  if (event.amountPaise != null && event.amountPaise !== pending.amountPaise) {
    await prisma.paymentReconciliation.create({
      data: {
        invoiceId: invoice.id,
        paymentId: pending.id,
        localStatus: pending.status,
        providerStatus: event.status,
        mismatch: true,
        notes: `amount mismatch local=${pending.amountPaise} provider=${event.amountPaise}`,
      },
    });
    return { ok: false, reason: "amount_mismatch" };
  }
  const paid = await prisma.$transaction(async (tx) => {
    const current = await tx.billingPayment.findUnique({ where: { id: pending.id } });
    if (!current) return null;
    if (current.status === "SUCCESS") return current;
    const row = await tx.billingPayment.update({
      where: { id: pending.id },
      data: {
        status: "SUCCESS",
        providerPaymentId: event.providerPaymentId ?? current.providerPaymentId,
        providerReference: event.providerPaymentId ?? current.providerReference,
        providerStatus: event.eventType,
        paidAt: new Date(),
        paymentDate: new Date(),
      },
    });
    const paidPaise = invoice.paidPaise + current.amountPaise;
    await tx.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        paidPaise,
        status: invoiceStatusFromPaid(invoice.totalPaise, paidPaise, invoice.status) as "ISSUED" | "PARTIALLY_PAID" | "PAID",
      },
    });
    return row;
  });
  if (!paid) return { ok: false, reason: "update_failed" };
  await writeSystemAudit({
    action: "billing.payment.confirmed",
    entityType: "BillingPayment",
    entityId: paid.id,
    institutionId: paid.institutionId,
    metadata: { invoiceId: invoice.id, providerEventId: event.providerEventId },
  });
  await notifyInstitutionAdmins({
    institutionId: paid.institutionId,
    type: "PAYMENT_RECEIVED",
    title: "Payment received",
    body: `Payment recorded for invoice ${invoice.invoiceNumber}.`,
    dedupeKey: `PAYMENT_RECEIVED:${paid.id}`,
  });
  return { ok: true, duplicate: false, paymentId: paid.id, invoiceId: invoice.id };
}

async function applyFailure(event: ProviderPaymentEvent) {
  const provider = getPaymentProvider();
  if (!provider || !event.providerOrderId) return { ok: false, reason: "missing_order" };
  const pending = await prisma.billingPayment.findFirst({
    where: { provider: provider.name.toUpperCase(), providerOrderId: event.providerOrderId },
  });
  if (!pending) return { ok: false, reason: "payment_not_found" };
  if (pending.status === "SUCCESS") return { ok: true, ignored: true, paymentId: pending.id };
  await prisma.billingPayment.update({
    where: { id: pending.id },
    data: {
      status: "FAILED",
      providerPaymentId: event.providerPaymentId,
      providerStatus: event.eventType,
      failureReason: "provider_failed",
    },
  });
  await writeSystemAudit({
    action: "billing.payment.failed",
    entityType: "BillingPayment",
    entityId: pending.id,
    institutionId: pending.institutionId,
    metadata: { providerEventId: event.providerEventId },
  });
  await notifyInstitutionAdmins({
    institutionId: pending.institutionId,
    type: "PAYMENT_FAILED",
    title: "Payment failed",
    body: "A checkout attempt could not be completed. The invoice is still unpaid.",
    dedupeKey: `PAYMENT_FAILED:${pending.id}`,
  });
  return { ok: true, paymentId: pending.id, invoiceId: pending.invoiceId };
}

async function applyRefund(event: ProviderPaymentEvent) {
  if (!event.providerPaymentId || !event.refundAmountPaise || !event.refundId) return { ok: false, reason: "incomplete_refund" };
  const payment = await prisma.billingPayment.findFirst({
    where: { providerPaymentId: event.providerPaymentId, status: "SUCCESS" },
  });
  if (!payment) return { ok: false, reason: "payment_not_found" };
  const refund = await recordRefund({
    invoiceId: payment.invoiceId,
    paymentId: payment.id,
    amountPaise: event.refundAmountPaise,
    reason: "provider_refund",
    dedupeKey: `provider:${event.refundId}`,
  });
  await writeSystemAudit({
    action: "billing.refund.completed",
    entityType: "BillingRefund",
    entityId: refund?.id ?? null,
    institutionId: payment.institutionId,
    metadata: { refundId: event.refundId },
  });
  return { ok: true, paymentId: payment.id, invoiceId: payment.invoiceId };
}

export async function processSignedWebhook(rawBody: string, signature: string | undefined) {
  const provider = getPaymentProvider();
  if (!provider) {
    return { statusCode: 503, body: { error: { code: ERROR_CODES.PAYMENTS_DISABLED, message: "Payments disabled" } } };
  }
  if (!signature || !provider.verifyWebhook(rawBody, signature)) {
    return { statusCode: 400, body: { error: { code: ERROR_CODES.VALIDATION, message: "Invalid webhook signature" } } };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: { error: { code: ERROR_CODES.VALIDATION, message: "Malformed payload" } } };
  }
  const event = provider.parseEvent(payload);
  if (!event) {
    return { statusCode: 200, body: { ignored: true } };
  }
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_providerEventId: { provider: provider.name, providerEventId: event.providerEventId } },
  });
  if (existing?.processingResult === "processed") {
    return { statusCode: 200, body: { duplicate: true, result: "processed" } };
  }
  let result = "ignored";
  let error: string | undefined;
  let invoiceId: string | undefined;
  let paymentId: string | undefined;
  try {
    if (event.status === "SUCCESS") {
      const applied = await applySuccess(event);
      result = applied.ok ? "processed" : "failed";
      error = applied.ok ? undefined : applied.reason;
      invoiceId = applied.invoiceId;
      paymentId = applied.paymentId;
    } else if (event.status === "FAILED" || event.status === "CANCELLED") {
      const applied = await applyFailure(event);
      result = applied.ok ? "processed" : "ignored";
      error = "reason" in applied ? applied.reason : undefined;
      invoiceId = applied.invoiceId;
      paymentId = applied.paymentId;
    } else if (event.status === "REFUNDED") {
      const applied = await applyRefund(event);
      result = applied.ok ? "processed" : "failed";
      error = applied.ok ? undefined : applied.reason;
      invoiceId = applied.invoiceId;
      paymentId = applied.paymentId;
    } else {
      result = "ignored";
    }
  } catch (err) {
    result = "failed";
    error = err instanceof Error ? err.message : "webhook_failed";
  }
  await prisma.paymentWebhookEvent.upsert({
    where: { provider_providerEventId: { provider: provider.name, providerEventId: event.providerEventId } },
    create: {
      provider: provider.name,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      processingResult: result,
      invoiceId,
      paymentId,
      payloadHash: payloadHash(rawBody),
      error,
    },
    update: {
      processingResult: result,
      invoiceId,
      paymentId,
      error,
    },
  });
  if (result === "failed") {
    return { statusCode: 500, body: { error: { code: ERROR_CODES.PAYMENT_FAILED, message: "Payment event could not be processed." } } };
  }
  return { statusCode: 200, body: { result, invoiceId, paymentId } };
}

export async function completeTestPayment(orderId: string, outcome: "SUCCESS" | "FAILED") {
  if (config.isProduction) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "Not found");
  const provider = getPaymentProvider();
  if (!(provider instanceof TestPaymentProvider)) throw notFound();
  const completed = provider.completeOrder(orderId, outcome);
  if (!completed) throw notFound();
  const eventType = outcome === "SUCCESS" ? "payment.captured" : "payment.failed";
  const payload = {
    event: eventType,
    payload: {
      payment: {
        entity: {
          id: completed.paymentId,
          order_id: orderId,
          amount: completed.amountPaise,
          currency: completed.currency,
          notes: { invoiceId: completed.invoiceId },
        },
      },
    },
  };
  const rawBody = JSON.stringify(payload);
  const secret = webhookSecretNow();
  return processSignedWebhook(rawBody, razorpaySignature(rawBody, secret));
}

export async function reconcileOpenPayments() {
  const provider = getPaymentProvider();
  if (!provider) return { checked: 0, mismatches: 0 };
  const pending = await prisma.billingPayment.findMany({
    where: { status: { in: ["PENDING", "SUCCESS"] }, provider: { not: "MANUAL" } },
    take: 100,
    orderBy: { createdAt: "desc" },
  });
  let mismatches = 0;
  for (const row of pending) {
    if (!row.providerPaymentId) continue;
    const remote = await provider.fetchPaymentStatus(row.providerPaymentId);
    const providerStatus = remote?.status ?? "UNKNOWN";
    const mismatch =
      (row.status === "SUCCESS" && providerStatus !== "SUCCESS") || (row.status === "PENDING" && providerStatus === "SUCCESS");
    await prisma.paymentReconciliation.create({
      data: {
        invoiceId: row.invoiceId,
        paymentId: row.id,
        localStatus: row.status,
        providerStatus,
        mismatch,
        notes: mismatch ? "local and provider disagree" : "in_sync",
      },
    });
    if (mismatch && row.status === "PENDING" && providerStatus === "SUCCESS") {
      await applySuccess({
        providerEventId: `reconcile:${row.providerPaymentId}`,
        eventType: "reconcile.paid",
        status: "SUCCESS",
        providerPaymentId: row.providerPaymentId,
        providerOrderId: row.providerOrderId ?? undefined,
        amountPaise: row.amountPaise,
      });
    }
    if (mismatch) mismatches += 1;
  }
  await writeSystemAudit({
    action: "billing.reconciliation.performed",
    entityType: "PaymentReconciliation",
    metadata: { checked: pending.length, mismatches },
  });
  return { checked: pending.length, mismatches };
}
