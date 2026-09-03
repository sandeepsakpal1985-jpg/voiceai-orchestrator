# ADR-014 Payment provider

## Status

Accepted

## Context

Phase 5 modeled invoices and manual payments. Phase 6 needs real collection in India without coupling domain code to a card SDK.

## Decision

One provider: Razorpay. `PaymentProvider` is the boundary. `RazorpayPaymentProvider` uses HTTPS + HMAC webhook verification. `PAYMENT_PROVIDER=test` exists only for local/CI and is forbidden in production. `PAYMENTS_ENABLED` defaults to false.

## Consequences

Adding Stripe later is a new provider class, not a rewrite of billing. Live sandbox E2E is blocked until keys exist.
