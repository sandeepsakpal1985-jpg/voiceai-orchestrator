import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { razorpaySignature, signaturesMatch, RazorpayPaymentProvider } from "./razorpay-provider.js";

describe("razorpay webhook signatures", () => {
  it("accepts a matching HMAC and rejects a tampered one", () => {
    const secret = "whsec_test";
    const body = '{"event":"payment.captured"}';
    const good = razorpaySignature(body, secret);
    expect(signaturesMatch(good, createHmac("sha256", secret).update(body).digest("hex"))).toBe(true);
    expect(signaturesMatch(good, "00".repeat(32))).toBe(false);
  });

  it("parses captured and failed payment events without SDK types", () => {
    const provider = new RazorpayPaymentProvider({ keyId: "id", keySecret: "sec", webhookSecret: "wh" });
    const captured = provider.parseEvent({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_1",
            order_id: "order_1",
            amount: 99900,
            notes: { invoiceId: "inv", institutionId: "inst" },
          },
        },
      },
    });
    expect(captured?.status).toBe("SUCCESS");
    expect(captured?.amountPaise).toBe(99900);
    const failed = provider.parseEvent({
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_2", order_id: "order_1", amount: 99900, notes: {} } } },
    });
    expect(failed?.status).toBe("FAILED");
  });
});
