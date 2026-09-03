# Payments

KluCoach collects **institution subscription invoices**, not parent coaching fees, through a payment provider.

Parent Student 360 fee cards remain `FeeInvoice` records. They must not show KluNex/partner economics.

## Cutover

`PAYMENTS_ENABLED` defaults to false.

- Billing pages stay visible.
- `POST /billing/invoices/:id/pay` returns `PAYMENTS_DISABLED` until enabled.
- Production startup requires Razorpay keys and `PAYMENT_WEBHOOK_SECRET` when payments are enabled.
- `PAYMENT_PROVIDER=test` is rejected in production.

## Provider abstraction

Business logic uses `PaymentProvider` (`createOrder`, `verifyWebhook`, `parseEvent`, `fetchPaymentStatus`, `refund`).

`RazorpayPaymentProvider` talks to Razorpay over HTTPS. Domain code does not import Razorpay SDK types.

Amounts come from the stored invoice outstanding balance (integer paise). Clients cannot set amount, institution, or invoice ownership.

## Authoritative confirmation

Checkout success pages are not proof of payment. `POST /webhooks/razorpay` verifies `X-Razorpay-Signature` (HMAC-SHA256 of the raw body) and then records `BillingPayment`.

Idempotency: unique `(provider, providerEventId)` on `PaymentWebhookEvent`. Duplicate deliveries return 200 and do not create a second SUCCESS payment.

Unsupported events are ignored (200). Invalid signatures return 400 (not processed). Temporary processing failures return 500 so the provider retries.

## Test provider

`PAYMENT_PROVIDER=test` plus `PAYMENTS_ENABLED=true` is for local/CI only. `POST /billing/payments/test-complete` drives the same webhook processor with a signed payload.

Live Razorpay sandbox checkout is **BLOCKED — EXTERNAL PROVIDER** until sandbox keys are present in the environment.

## Refunds

Super-admin only. A refund is a new `BillingRefund` row. Invoice `totalPaise` is not rewritten. When a provider payment id exists, the provider refund API is called first.

## GST / tax

Tax fields exist on invoices. Rates are configuration. Legal GST treatment requires accountant/legal validation before production. Do not hard-code GST.

## Reconciliation

`POST /billing/reconciliation/run` (super-admin) and the hourly worker job compare local payment rows to provider status. Mismatches are stored on `PaymentReconciliation`; history is not silently overwritten. A pending local row that the provider reports paid is confirmed through the same success path.
