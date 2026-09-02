# ADR-013 Billing and subscription architecture

## Status

Accepted

## Context

KluCoach needs an explicit commercial engine: who owes what, which students are entitled, what KluNex vs the partner is contracted to receive. List prices must stay data. A card network or Razorpay/Stripe integration is a later phase.

## Decision

- Integer **paise** on all money fields.
- `SubscriptionPlan` catalog + `TenantSubscription` **snapshots** (student unit price, KluNex realization, partner share, currency, mode).
- `StudentEntitlement` is the student-level access record; `EntitlementService` is the only entitlement API.
- Institution `BillingInvoice` / line / `BillingPayment` / `BillingRefund` are separate from parent `FeeInvoice`.
- `Institution.billingMode` (`LIVE` vs `NON_BILLABLE`/`DEMO`) is the documented demo bypass.
- Super-admin owns commercial write; institution admin reads own tenant only.
- No payment SDK. Manual payment records only.
- Idempotency keys on invoice issue and payment/refund writes.
- Invoice totals are immutable; refunds are additional rows.

Grace period days come from `PlatformBillingConfig` (default 7) and may be copied onto a subscription. Billable statuses are configurable; default ACTIVE only.

## Consequences

- A 2,000-student institute can be answered from the database: billable count, gross, KluNex, partner, invoiced, paid, renewal.
- Catalog price changes do not silently rewrite live contracts.
- Academic Phase 4 journeys remain available on NON_BILLABLE demo tenants.
