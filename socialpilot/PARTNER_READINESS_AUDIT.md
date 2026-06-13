# Partner Sales Readiness Audit — MetaPilot AI

> **Objective:** Can a city-level partner sign up, create customers, track commissions, and view MRR without developer assistance?

## Partner Workflow

```
Admin creates partner → Partner referral link → Customer signs up with referral
  → Partner sees customer in portal → Commissions tracked monthly
  → Partner can view MRR, commission earned, client list
```

## Audit Results

### 1. Can a partner create customers?
**Status:** ❌ No — Partners cannot create customers directly

**Current flow:**
- Admin creates partner in the admin panel (`POST /api/partners`)
- Admin assigns customers to partners (`POST /api/partners/:id/assign`)
- Customer is linked via `User.referredByPartner` field
- **Partner has no way to create or invite customers** from their portal

**What's needed for self-service:**
- Partner needs a referral link or invite code they can share
- Customer signs up with that link and auto-links to partner
- Currently there's no referral mechanism — all assignment is admin-only

### 2. Can a partner track customers?
**Status:** ⚠️ Partial — Can view but not manage

**Verified:**
- `GET /api/partners/portal` returns customer list with subscription status ✅
- UI shows: name, email, plan, status, join date ✅
- BUT: Portals uses `{ where: { email: auth.email } }` — only works if partner's email matches a User email ❌

**Gap:** Partner auth is fragile. It searches for a partner record by the authenticated user's email. This won't work if:
- The partner was created with a different email than their login
- The partner hasn't created a User account

### 3. Can a partner view commissions?
**Status:** ✅ Yes — Commission data displayed

**Verified:**
- Commission rate shown in portal ✅
- Commission earned displayed as currency ✅
- MRR calculated from active customer subscriptions ✅
- CommissionHistory not shown in portal (only admin sees it) ❌

### 4. Can a partner track MRR?
**Status:** ✅ Yes — MRR calculated live

**Verified:**
- MRR calculated from active subscription plan prices ✅
- Prices: Starter ₹2,900 / Professional ₹7,900 / Agency ₹19,900 ✅
- Active vs total customer count displayed ✅

### 5. Commission History
**Status:** ✅ Available via admin API

**Verified:**
- `CommissionRecord` model exists with monthly records ✅
- `GET /api/partners/:id` returns commission history ✅
- Portal shows current commission earned but NOT past months ❌

## Gaps Found

### 🔴 Critical: No Partner Registration/Signup Flow
Partners cannot independently create an account. An admin must:
1. Create the partner record in the admin panel
2. Assign customers manually
3. The partner then... needs a User account with matching email to log in

**Fix needed:** Add partner registration with referral code. When a customer signs up with a partner's referral code, they auto-link.

### 🟡 High: Partner Auth Via Email Match is Fragile
```typescript
const partner = await fastify.prisma.partner.findFirst({
  where: { email: auth.email },
});
```

This only works if the partner's email matches their login email exactly. If the partner hasn't created a User account, this returns empty.

**Fix needed:** Link partner to User at creation time, or generate a partner-specific auth token.

### 🟡 Medium: No Referral Link Generation
Partners have no way to generate a shareable referral link. Without this, partners can't drive new signups — they're purely reactive (admin assigns customers).

**Fix needed:** Generate a referral code per partner that can be included in signup URL.

### 🟢 Low: Commission History Not Visible in Portal
The partner portal shows current month's commission but doesn't show past months' history.

**Fix needed:** Add commission history table to the portal page.

## Summary

| Capability | Status | Notes |
|------------|--------|-------|
| Create customers | ❌ Missing | No referral link |
| View customers | ⚠️ Partial | Auth via email match is fragile |
| View commissions | ✅ Yes | Current month displayed |
| View MRR | ✅ Yes | Calculated live from subscriptions |
| Commission history | ⚠️ Partial | Available via admin API, not portal |
| Self-service signup | ❌ Missing | Admin must create partner |

**Score: 45/100** — The partner system has the backend infrastructure but is not ready for self-service partners. Admin-assisted only.
