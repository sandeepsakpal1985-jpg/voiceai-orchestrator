export type CheckoutSession = {
  provider: "razorpay" | "test";
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  invoiceId: string;
};

export type ProviderPaymentEvent = {
  providerEventId: string;
  eventType: string;
  status: "SUCCESS" | "FAILED" | "PENDING" | "CANCELLED" | "REFUNDED";
  providerPaymentId?: string;
  providerOrderId?: string;
  amountPaise?: number;
  currency?: string;
  invoiceId?: string;
  institutionId?: string;
  refundId?: string;
  refundAmountPaise?: number;
};

export type ProviderPaymentStatus = {
  providerPaymentId: string;
  status: "SUCCESS" | "FAILED" | "PENDING" | "CANCELLED";
  amountPaise: number;
  orderId?: string;
};

export interface PaymentProvider {
  name: "razorpay" | "test";
  createOrder(input: {
    invoiceId: string;
    institutionId: string;
    amountPaise: number;
    currency: string;
    receipt: string;
  }): Promise<CheckoutSession>;
  verifyWebhook(rawBody: string, signature: string): boolean;
  parseEvent(payload: unknown): ProviderPaymentEvent | null;
  fetchPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentStatus | null>;
  refund(input: { providerPaymentId: string; amountPaise: number }): Promise<{ refundId: string }>;
}
