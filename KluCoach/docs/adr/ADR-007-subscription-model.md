# ADR-007 Subscription model

## Status

Accepted

## Context

List prices (₹1999 / ₹999 / ~₹500 realization) must not be scattered in code.

## Decision

`SubscriptionPlan` rows with amounts in **integer paise**. `TenantSubscription` binds a tenant. `StudentEntitlement` binds a student to a billing period. Partner share fields are data, not a payout engine.

Seed may insert example plans. Runtime reads the database.

## Consequences

- Commercial changes do not require a deploy of magic numbers
- Payout/settlement is out of MVP
