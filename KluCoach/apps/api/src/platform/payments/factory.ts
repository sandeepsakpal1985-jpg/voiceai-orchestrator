import { config } from "../../config.js";
import type { PaymentProvider } from "./provider.js";
import { RazorpayPaymentProvider } from "./razorpay-provider.js";
import { TestPaymentProvider } from "./test-provider.js";

export function paymentsEnabledNow() {
  return process.env.PAYMENTS_ENABLED === "true";
}

export function webhookSecretNow() {
  return process.env.PAYMENT_WEBHOOK_SECRET || config.paymentWebhookSecret || "test-webhook-secret";
}

export function getPaymentProvider(): PaymentProvider | null {
  if (!paymentsEnabledNow() && !config.paymentsEnabled) return null;
  const name = process.env.PAYMENT_PROVIDER || config.paymentProvider;
  if (name === "razorpay") {
    return new RazorpayPaymentProvider({
      keyId: process.env.RAZORPAY_KEY_ID || config.razorpayKeyId,
      keySecret: process.env.RAZORPAY_KEY_SECRET || config.razorpayKeySecret,
      webhookSecret: webhookSecretNow(),
    });
  }
  if (name === "test" && !config.isProduction) {
    return new TestPaymentProvider(webhookSecretNow());
  }
  return null;
}
