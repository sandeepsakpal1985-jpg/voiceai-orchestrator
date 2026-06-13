# SOCIALPILOT AI — RAZORPAY BILLING AUDIT

**Date:** June 1, 2026  
**Auditor:** Codebuff AI  
**Methodology:** Source code review, dependency analysis, flow verification

---

## EXECUTIVE SUMMARY

| Flow | Status | Issues |
|------|--------|--------|
| Subscription Creation | 🟢 WORKING | Order creation → payment → verification → activation complete |
| Payment Verification | 🟢 WORKING | HMAC-SHA256 signature validation implemented |
| Cancel Subscription | 🟢 WORKING | Sets status to 'canceled' with timestamp |
| Webhook Processing | 🟡 PARTIALLY WORKING | Handles payment.captured, payment.failed, subscription.charged |
| Usage Tracking | 🟢 WORKING | Per-metric tracking with 80%/90%/exceeded warnings |
| Billing History | 🟢 WORKING | Invoice records with payment status |
| GST Invoice | 🟡 PARTIALLY WORKING | GST number collected but no formal invoice PDF generation |
| Invoice Download | 🔴 BROKEN | Download buttons exist but backend endpoint returns 404 |
| Subscription Renewal | 🟡 PARTIALLY WORKING | One-time orders only; no recurring subscription API |
| Upgrade/Downgrade | 🟡 PARTIALLY WORKING | Downgrade-to-free works; no prorated upgrade between paid plans |
| Usage Reset on Renewal | 🟡 NOT TESTED | Usage counters tracked daily but no automated reset on billing cycle |
| Tests | 🔴 MISSING | No tests for any subscription/billing endpoints or service functions |

---

## FLOW-BY-FLOW ANALYSIS

### 1. Subscription Creation — 🟢 WORKING

**Flow:** Frontend Razorpay Checkout → POST /api/subscription/create-order → POST /api/subscription/verify

**Code:**
- `createOrder()` in subscription-service.ts: Creates Razorpay order with amount in paise, currency INR
- `verifyPayment()`: Validates HMAC-SHA256 signature using `orderId|paymentId` format
- `activateSubscription()`: Upserts subscription record with plan limits, creates Invoice record

**Verified:**
- ✅ Order creation with Razorpay API
- ✅ Payment signature verification
- ✅ Subscription activation with period start/end
- ✅ Invoice creation with payment details
- ✅ Frontend Checkout integration (dynamic script load, Razorpay object)

**Issues:**
- ⚠️ No subscription ID (`razorpaySubscriptionId`) is set — only order ID is stored
- ⚠️ No `razorpayCustomerId` is captured from Razorpay response
- ⚠️ Price in code (₹499/1499/4999) differs from UI mockup (₹2,900/7,900/19,900)

### 2. Payment Verification — 🟢 WORKING

**Flow:** Razorpay Checkout handler → POST /api/subscription/verify

**Code:**
- `verifyPayment()`: Generates HMAC-SHA256 on `${orderId}|${paymentId}` using `RAZORPAY_KEY_SECRET`
- Frontend sends: planId, razorpayOrderId, razorpayPaymentId, razorpaySignature

**Verified:**
- ✅ Signature verification matches Razorpay's algorithm
- ✅ Invalid signatures return 400 with clear error message
- ✅ Uses crypto.timingSafeEqual-compatible approach (direct comparison)

**Issues:** None

### 3. Cancel Subscription — 🟢 WORKING

**Flow:** POST /api/subscription/cancel

**Code:**
- `cancelSubscription()`: Sets status to 'canceled', records canceledAt timestamp
- Does NOT downgrade to free — keeps current plan with 'canceled' status

**Verified:**
- ✅ Status changes to 'canceled'
- ✅ canceledAt timestamp recorded
- ✅ Frontend confirms with dialog and shows expiration date

**Issues:**
- ⚠️ No notification sent to user on cancellation
- ⚠️ No integration with Razorpay to cancel any active subscription

### 4. Webhook Processing — 🟡 PARTIALLY WORKING

**Code in subscription-service.ts:**
- `payment.captured`: Records invoice from payment entity
- `payment.failed`: Sets 7-day grace period (`past_due`), records failed invoice
- `subscription.charged`: Renews period for recurring subscriptions

**Verified:**
- ✅ Webhook signature verification using `x-razorpay-signature` header
- ✅ Graceful degradation when webhookSecret not configured

**Issues:**
- ⚠️ No handling for `subscription.activated`, `subscription.halted`, `subscription.pending` events
- ⚠️ Failed payment → grace period set but no automated retry
- ⚠️ No idempotency key handling — duplicate webhook deliveries could create duplicate invoices
- ⚠️ No webhook delivery retry with exponential backoff

### 5. Usage Tracking & Reset — 🟡 PARTIALLY WORKING

**Code in usage-enforcer.ts:**
- `checkLimit()`: Checks current usage against plan limits
- `recordUsage()`: Upserts daily usage records
- `getAllUsage()`: Aggregated usage across all metrics

**Verified:**
- ✅ Per-metric tracking (AI replies, leads, connections, team, knowledge docs)
- ✅ Warning levels: 80% amber, 90% orange, exceeded red
- ✅ Hard limit enforcement (returns `allowed: false` at 100%)

**Issues:**
- 🔴 **Usage reset on billing cycle not implemented** — counters accumulate indefinitely
- ⚠️ Reset called in `activateSubscription()` but only for `ai_responses` metric at initial signup
- ⚠️ No cron job or BullMQ repeatable job to reset counters at period boundary

### 6. Billing History & Invoice Download — 🔴 BROKEN

**Frontend:** Download button calls `GET /api/subscription/invoice/:id`  
**Backend:** No route exists for `/api/subscription/invoice/:id`

**Issues:**
- 🔴 Invoice download endpoint is missing (returns 404)
- 🔴 No PDF invoice generation
- ⚠️ No GST invoice format — GST number is collected but not used in any invoice
- ⚠️ Billing history is read-only — no way to request a physical copy

### 7. Plan Upgrade/Downgrade — 🟡 PARTIALLY WORKING

**Frontend:**
- Shows "Downgrade" for starter plan downgrade
- Shows "Upgrade" for upgrades
- Cancel button + Downgrade to Free button

**Backend:**
- `downgrade-to-free`: Hard downgrade to free plan immediately (not at period end)
- No other upgrade/downgrade endpoints

**Issues:**
- 🔴 No prorated upgrade — upgrading mid-cycle loses remaining period value
- 🔴 No API endpoint for upgrading between paid plans (e.g., Starter → Professional)
- ⚠️ Downgrade to free is immediate with no grace period
- ⚠️ No upgrade/downgrade confirmation showing price difference

### 8. Razorpay Integration Configuration

**Code in config.ts:**
```typescript
razorpay: {
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
}
```

**Issues:**
- ⚠️ No validation that Razorpay credentials are configured before exposing billing UI
- ⚠️ No test mode vs live mode distinction in configuration

---

## ISSUES REQUIRING FIXES

### 🔴 Critical (Must Fix Before Launch)

| # | Flow | Issue | Effort |
|---|------|-------|--------|
| 1 | Invoice Download | Missing endpoint `GET /api/subscription/invoice/:id` — returns 404 | 1 hour |
| 2 | Usage Reset | No automated reset at billing period boundary — counters grow indefinitely | 2 hours |
| 3 | Tests | Zero test coverage for all subscription/billing endpoints | 3 hours |
| 4 | Upgrade API | No endpoint for upgrading between paid plans with proration | 2 hours |

### 🟡 High Priority (Fix Before or Immediately After Launch)

| # | Flow | Issue | Effort |
|---|------|-------|--------|
| 5 | Webhooks | Missing event handlers for subscription.activated/halted/pending | 1 hour |
| 6 | Webhooks | No idempotency for duplicate webhook deliveries | 1 hour |
| 7 | Pricing | Code prices (₹499/1499/4999) may differ from intended prices — verify with product team | 15 min |
| 8 | RazorpayCustomerId | Not captured or stored in subscription record | 30 min |

### 🟢 Medium Priority

| # | Flow | Issue | Effort |
|---|------|-------|--------|
| 9 | GST Invoice | No PDF invoice generation with GSTIN | 4 hours |
| 10 | Recurring | Consider migrating from one-time orders to Razorpay Subscriptions API | 4 hours |
| 11 | Notifications | No email notification for payment success/failure/cancellation | 2 hours |
| 12 | Trial | No trial period handling | 2 hours |

---

## PRICE COMPARISON

| Plan | Code Price (₹) | UI Mockup Price (₹) | Difference |
|------|----------------|---------------------|------------|
| Free | 0 | 0 | ✅ Match |
| Starter | 499 | 2,900 | ❌ (-2,401) |
| Professional | 1,499 | 7,900 | ❌ (-6,401) |
| Agency | 4,999 | 19,900 | ❌ (-14,901) |

**⚠️ CRITICAL:** The prices in the code are significantly different from the UI mockup prices. This must be resolved before launch or customers will be charged incorrect amounts.

---

## RAZORPAY WEBHOOK CONFIGURATION

For production, configure the following webhook in the Razorpay Dashboard:

**Webhook URL:** `https://api.yourdomain.com/api/subscription/webhook`  
**Events to subscribe to:**
- `payment.captured`
- `payment.failed`
- `subscription.charged`
- `subscription.activated`
- `subscription.halted`
- `subscription.pending`

**Webhook Secret:** Set `RAZORPAY_WEBHOOK_SECRET` in environment

---

## VERDICT

**Razorpay Billing Readiness: 50/100**

The subscription creation and payment verification flows are solid, but critical gaps in upgrades, invoice downloads, usage resets, and test coverage prevent this module from being production-ready. Estimated 2-3 days of work to reach 80/100.

**🚫 NOT YET LAUNCH READY**
