# Billing and subscriptions

Commercial engine for KluCoach. Collection is documented in [PAYMENTS.md](./PAYMENTS.md). This file remains the commercial engine (plans, invoices, entitlements). It is **not** an accounting package.

Amounts are **integer paise** (₹1 = 100). Do not use floating-point money in application logic.

Demo financial rows are labeled as demo configuration. They are not live settlements.

---

## Commercial model (configuration)

Public/direct and partner figures live on `SubscriptionPlan` rows and on each `TenantSubscription` **price snapshot**. They must not be hard-coded in services.

Seed example (Partner plan):

| Concept | Seed value (paise) |
|---------|--------------------|
| List / direct reference | 199900 (₹1,999) |
| Partner student unit price | 99900 (₹999) |
| KluNex realization | 50000 (₹500) |
| Institution/partner share | 49900 (₹499) |

Partner share is stored explicitly. It is not computed as price − realization, so future splits can differ.

SafeTrack RFID/GPS list prices are **planning figures only** until a dedicated `SubscriptionPlan` snapshot exists. Do not hard-code ₹1,499 / ₹2,499 in services. GPS connectivity (roughly ₹300–₹1,000/student/year plus ₹1,500–₹4,000 hardware) is an unfunded per-student cost until quoted — see [ADR-009](./adr/ADR-009-operating-cost-discipline.md).

---

## Concepts (keep separate)

| Concept | Meaning |
|---------|---------|
| Price | Unit commercial term on a plan or snapshot |
| Invoice | Obligation for a period (institution → KluNex) |
| Payment | Recorded receipt against an invoice (manual or provider-verified) |
| Refund | Separate record; does not rewrite invoice `totalPaise` |
| Entitlement | Whether a student may use KluCoach |
| KluNex realization / partner share | Contracted split, not cash already paid |

---

## Plans and snapshots

`SubscriptionPlan` is the catalog (DIRECT, PARTNER, PREMIUM in seed). Billing periods: MONTHLY, QUARTERLY, ANNUAL, CUSTOM. KluCoach MVP uses **ANNUAL**.

When a `TenantSubscription` is created, unit prices and commercial mode are **copied onto the subscription**. Later catalog changes do not rewrite existing contracts. Renewal writes a **new** snapshot onto the same tenant row; historical invoices keep their line amounts.

---

## Subscription lifecycle

Statuses: TRIAL, ACTIVE, PAST_DUE, SUSPENDED, EXPIRED, CANCELLED.

Reads can compute status from `endsAt` + `gracePeriodDays` (platform default 7, overridable per subscription). `POST /billing/lifecycle/apply` (super-admin) still persists grace/expiry. The worker also runs `billing.lifecycle` once per UTC hour (`job_runs.dedupeKey`). Running it twice in the same hour is a no-op.

Cancelled/suspended stored status is not overridden by dates.

---

## Student entitlement

Institution subscription ≠ student access. `StudentEntitlement` answers: is this student entitled?

Statuses: ACTIVE, GRACE, EXPIRED, CANCELLED.

Billable student (default): `Student.status = ACTIVE`, not archived, entitlement ACTIVE or GRACE. INACTIVE / TRANSFERRED / COMPLETED / DROPPED are excluded unless `PlatformBillingConfig.billableStudentStatuses` says otherwise.

Mid-year join: entitle for the current period at the snapshot unit price. **No proration in MVP.**

`EntitlementService` is the only place that answers entitlement. Academic APIs are **not** gated in this phase.

---

## Demo / non-billable access

`Institution.billingMode`:

- `LIVE` — entitlements are commercially meaningful
- `NON_BILLABLE` or `DEMO` — academic access is not locked if billing dates lapse

Seed Demo Coaching Institute and Other Academy are **NON_BILLABLE** so Phase 4 parent/teacher journeys cannot be locked out. The mechanism is the `billingMode` column, not a hidden environment flag.

Expiry **never deletes** students, parents, attendance, assessments, assignments, notices, or audit logs.

---

## Institution invoices vs parent fees

Two different products:

1. **`BillingInvoice`** — KluCoach subscription billed to the institution (student count × snapshot unit price). Line items store count, unit price, period, amount.
2. **`FeeInvoice`** — coaching fee the parent sees on Student 360. Unchanged product; parent never sees KluNex realization or partner share.

Invoice statuses (institution): DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, VOID, REFUNDED.

Historical `totalPaise` is immutable. Corrections use payment, refund, credit (refund record), or a new invoice.

Idempotency: unique `(institutionId, dedupeKey)` on invoices and payments.

Tax: `taxPaise` + `taxRateBps` + `taxInclusive`. Default seed tax is 0. GST treatment is **not** hard-coded; legal/accountant validation is required before production.

Currency is stored on plan, subscription, and invoice. Default INR; not mathematically mandatory.

---

## Payments and refunds

`BillingPayment` methods: MANUAL (MVP). Provider may later be TEST / RAZORPAY / STRIPE. **No gateway in this phase.**

Refunds reference a payment. They reduce `paidPaise` (settlement state) and never change `totalPaise`.

---

## Partner economics

Super-admin `GET /billing/report` (CSV at `/billing/report.csv`):

Per institution: commercial mode, billable students, unit price, gross, KluNex realization, partner share, period, renewal, invoiced/paid/outstanding.

Counts use tenant-scoped SQL aggregation, not loading every student into memory.

---

## RBAC

| Role | Access |
|------|--------|
| SUPER_ADMIN | Plans, config, issue invoice, record payment/refund, cross-tenant report |
| INSTITUTION_ADMIN | Own subscription, billable count, invoices (read). Cannot change KluNex/partner rates |
| TEACHER / STAFF / STUDENT | No billing |
| PARENT | Child `FeeInvoice` / Student 360 fee card only |

Cross-tenant invoice/subscription/payment/report access: **404** (or 403 when the role has no billing permission at all).

---

## Notifications

Issuing an institution invoice notifies institution admins in-app (`INVOICE_ISSUED`). Reuses `NotificationService`. No dunning engine.

---

## API (session tenant; never trust body `institutionId` as authority)

Institution admin: `GET /billing/subscription`, `GET /billing/invoices`, `GET /billing/invoices/:id`

Super-admin: `/billing/plans`, `/billing/report`, `/billing/invoices/issue`, `/billing/payments`, `/billing/refunds`, `/billing/lifecycle/apply`, `/billing/config`

`GET /billing/subscription?asOf=2028-04-01` computes status without waiting.

See [ADR-013](./adr/ADR-013-billing-subscriptions.md).
