# ADR-015 Webhook architecture

## Status

Accepted

## Context

Provider retries, out-of-order events, and forged callbacks are the default on the public internet.

## Decision

`POST /webhooks/razorpay` is unauthenticated except for signature verification on the **raw** body. Amounts and invoice ids are taken from stored invoices / pending payments, not from the client. `PaymentWebhookEvent` enforces unique `(provider, providerEventId)`. Success is 200 only after processing or a recognized duplicate. Failures that should retry return 5xx.

## Consequences

Frontend payment-success is informational. Operators debug via webhook event rows and audit logs, not card data.
