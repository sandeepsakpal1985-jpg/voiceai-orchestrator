# MetaPilot AI — Launch Blockers Audit

> **Objective:** "Can a paying customer sign up today and successfully use MetaPilot AI without contacting support?"
>
> Every module scored: Complete | Partial | Broken | Mock | Untested
>
> **Overall Score: 72/100**
>
> Based on: Severity-weighted scoring of the 10 highest-impact criteria.

---

## Executive Summary

| Category | Score | Verdict |
|----------|-------|---------|
| **Authentication** | 85/100 | Functional. Missing email verification & password reset. |
| **Meta OAuth** | 90/100 | Full flow works. Token auto-refresh missing. |
| **Webhooks** | 92/100 | Properly secured. No retry on processing failure. |
| **AI Reply Engine** | 70/100 | Depends on OPENAI_API_KEY. No fallback to local LLM. |
| **Customer Memory** | 85/100 | Mem0 integrated. Context builder uses FAQ + memory. |
| **Escalation** | 88/100 | 8 threat patterns detected. No email notification. |
| **CRM** | 92/100 | Full Kanban + activities. Missing pipeline velocity. |
| **Revenue Analytics** | 90/100 | Real queries. Needs invoice-level breakdown. |
| **Reporting** | 80/100 | Works manually. Cron not auto-started in production. |
| **Billing** | 60/100 | Razorpay integrated but no UI without keys. No proration. |
| **Partner Portal** | 65/100 | Works but partner auth is fragile (email matching). |
| **Automation** | 75/100 | Keyword triggers + copilot work. Auto-like is no-op. |
| **Content Intelligence** | 70/100 | Real engagement data. Reach/likes/shares are mocked. |
| **Analytics** | 95/100 | All queries hit real database. |
| **Health Monitoring** | 90/100 | Real Meta API ping. No auto-fix for expired tokens. |
| **Deployment** | 75/100 | Docker configs ready. Workers need env vars. |

---

## Critical Launch Blockers (Must Fix Before Paying Customers)

### 🔴 CRITICAL — Blocking Production Launch

#### 1. Razorpay Billing: Missing Keys Default

**Status:** Partial
**Severity:** 🔴 CRITICAL

**What works:**
- Full subscription flow: create-order → verify → activate → cancel → upgrade → downgrade
- Razorpay webhook handling with signature verification
- Invoice URL fetching and caching
- Usage tracking with limits

**What's broken:**
- If `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are not set, the `/create-order` endpoint will throw an unhandled error (tries to instantiate Razorpay client with empty key)
- The subscription page will crash for any paying customer who clicks "Subscribe"

**Fix required:**
```typescript
// In subscription-service.ts createOrder():
if (!config.razorpay.keyId || !config.razorpay.keySecret) {
  throw new Error('Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
}
// Should return 503 with user-friendly message, not crash
```

**Test:** Billing page has tests but they mock the API, so this path is untested.

---

#### 2. AI Reply Engine: No Fallback Without OpenAI Key

**Status:** Partial
**Severity:** 🔴 CRITICAL

**What works:**
- OpenAI client with `generateCompletion()` and `generateJSON()` 
- Classification, reply generation, lead extraction
- Personality presets (5 tones)
- Context builder using FAQ + customer memory

**What's broken:**
- If `OPENAI_API_KEY` is not set, every AI reply attempt crashes with an unhandled error
- No graceful degradation to local model (Ollama/Qwen code exists in config but isn't wired)
- No cached/fallback responses for when AI fails

**Fix required:**
- Graceful error handling: "AI is not configured. Please contact support."
- Document OPENAI_API_KEY requirement prominently in .env.example and setup docs
- Consider wrapping with try/catch that returns a safe "I'm sorry, I'm having trouble processing your request right now" fallback

---

#### 3. Environment Variable Documentation Gap

**Status:** Partial
**Severity:** 🔴 CRITICAL

**What works:**
- `.env.example` has all 50+ variables documented
- `config.ts` reads all env vars with defaults for non-critical ones

**What's broken:**
- 6 required env vars have NO validation at startup:
  - `DATABASE_URL` — will crash at first Prisma query
  - `REDIS_URL` — will crash workers silently
  - `JWT_SECRET` — has warning but no hard stop in production
  - `META_APP_ID` / `META_APP_SECRET` — OAuth returns 503 with message (good)
  - `OPENAI_API_KEY` — no check, crashes at first AI call
  - `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — crashes on payment

**Fix required:**
- Startup validation that checks required env vars and prints clear errors
- Consider `config.ts` validator that runs at app startup

---

#### 4. Worker Queue: Silent Failures Without Redis

**Status:** Untested
**Severity:** 🔴 CRITICAL

**What works:**
- BullMQ queue service with retry, backoff, connection pooling
- 3 workers: comment, DM, re-engagement
- Batch processing methods exist

**What's broken:**
- If Redis is down, workers fail silently (just hang)
- No healthcheck endpoint for queue connectivity
- Workers don't verify queue connection on startup

**Fix required:**
- Worker startup healthcheck: "Waiting for Redis..."
- Admin health endpoint should show queue connection status
- Document Redis requirement prominently

---

### 🟡 HIGH — Will Cause User Frustration

#### 5. Email Verification Not Implemented

**Status:** Missing
**Severity:** 🟡 HIGH

**What works:**
- Registration with email + password
- Google OAuth login
- JWT token generation

**What's broken:**
- Anyone can register with any email (no verification)
- No password reset flow
- If Resend API key is set, emails work, but verification flow was never implemented

**Fix required for paying customers:**
- Email verification on signup (sends verification link)
- Password reset (sends reset link)

---

#### 6. Approval Mode Doesn't Actually Publish

**Status:** Partial
**Severity:** 🟡 HIGH

**What works:**
- Approval workflow: create pending → approve/reject/edit-publish
- WebSocket broadcast on status change
- Stats tracking (approval rate, rejection rate)

**What's broken:**
- "Approve" marks the approval request as approved in DB — **it does not actually publish the reply to Instagram/Facebook**
- The comment's `replyStatus` is NOT updated to `replied`
- No Meta Graph API call is made to actually post the approved reply

**This means:** A business owner approves a reply, sees "Approved" status, but the reply never reaches the customer on Instagram.

**Fix required:**
- After approval, call Meta Graph API to post the reply
- Update `socialComment.replyStatus` to `replied`
- Store the approved reply content in the comment

---

#### 7. Partner Auth is Fragile

**Status:** Partial
**Severity:** 🟡 HIGH

**What works:**
- Partner CRUD with commission rate
- Customer assignment to partners
- MRR calculation from subscription plans
- Commission history tracking
- Partner portal endpoint

**What's broken:**
- Partner portal auth uses `email` match: `{ where: { email: auth.email } }`
- This only works if the partner's email matches a User record's email
- Partners don't have separate login credentials
- **A partner cannot log in and see their portal as a partner** — they'd need to be signed up as a regular user with the same email

**Fix required:**
- Create proper partner authentication (separate login or link partner to user account at partner creation)
- Or: Generate a partner-specific access token/link

---

#### 8. Content Intelligence Reach/Likes/Shares Are Mocked

**Status:** Mocked
**Severity:** 🟡 HIGH

**What works:**
- Real comment aggregation by postId
- Comment count, unique commenters, sentiment scoring, lead attribution
- Engagement score calculation (weighted formula)
- Top 10 posts sorting and filtering

**What's broken:**
- `estimatedReach` = totalComments * 50 (completely fake)
- `estimatedLikes` = totalComments * 0.4 (completely fake)
- `estimatedShares` = totalComments * 0.1 (completely fake)
- `engagementRate` = derived from fake numbers
- A business owner looking at "Reach: 2,500" will have no idea it's made up

**Fix required:**
- Call Meta Graph API for actual post metrics (reach, likes, shares)
- Or remove these fields and clearly label as "estimated"
- Or show "Connect for real metrics" CTA when data is mocked

---

#### 9. Auto-Like is a No-Op

**Status:** Broken
**Severity:** 🟡 HIGH

**What works:**
- Endpoint exists: `POST /api/automation/auto-like`
- Validates commentId and platform
- Checks for active Meta connection

**What's broken:**
- It only logs: `Would like ${platform} comment ${commentId}`
- Doesn't actually call Meta Graph API to like the comment
- Returns `{ liked: true, note: "Auto-like logged. In production, this calls the Meta Graph API." }`

**This means:** Any auto-like trigger rule is silently doing nothing.

**Fix required:**
- Call `POST /{ig-comment-id}/likes` or `POST /{comment-id}/likes` on Meta Graph API
- Or remove the feature from the UI if Meta API doesn't support it

---

### 🟢 LOW — Shipping with Known Gaps

#### 10. No Token Auto-Refresh

**Status:** Missing
**Severity:** 🟢 LOW

**What works:**
- Manual token refresh endpoint: `POST /api/meta/connections/:id/refresh`
- Token expiry tracking in health dashboard
- Health check marks tokens as `error` on 401/403

**What's missing:**
- No automatic token refresh when approaching expiry (60-day Meta tokens)
- Customer has to manually reconnect when token expires
- No email/SMS notification that token is about to expire

**Impact:** After 60 days, Meta connection silently breaks. AI replies stop. CRM stops getting new leads.

---

#### 11. No Webhook Processing Retry

**Status:** Missing
**Severity:** 🟢 LOW

**What works:**
- Webhook processor creates records and queues jobs
- Errors are stored on MetaWebhook record
- Health dashboard shows error rate

**What's missing:**
- Failed webhooks are not retried
- If queue.add() fails, the error is stored but the event is not reprocessed

**Impact:** Occasional lost events in high-traffic periods.

---

#### 12. Email Notifications for Escalations

**Status:** Missing
**Severity:** 🟢 LOW

**What works:**
- Escalation auto-detection with 8 threat patterns
- Escalation ticket creation with severity
- WebSocket broadcast on escalation status change

**What's missing:**
- No email/SMS notification when a critical escalation is created
- Business owner won't know about a legal/fraud escalation unless they're actively watching the dashboard

---

#### 13. No Subscription Proration for Upgrades

**Status:** Missing
**Severity:** 🟢 LOW

**What works:**
- Upgrade endpoint creates a new Razorpay order for the full plan price
- Downgrade endpoint switches immediately with limit reset

**What's missing:**
- No proration calculation for upgrade mid-cycle
- Customer pays full price on upgrade instead of prorated difference

**Impact:** Customer dissatisfaction if they upgrade mid-cycle.

---

#### 14. Background Worker Docker Health Issues

**Status:** Untested
**Severity:** 🟢 LOW

**What works:**
- Dockerfile.worker with multi-stage build
- Workers compile and typecheck clean
- docker-compose.yml has all 3 workers configured

**What's missing:**
- Workers haven't been tested with actual Redis in Docker
- Worker startup order isn't guaranteed (might start before Redis is ready)
- No healthcheck endpoint for worker processes

---

## Frontend Data Reality Check

| Page | Data Source | Reality | Status |
|------|-------------|---------|--------|
| Dashboard | 6 API calls to real endpoints | Real DB data | ✅ |
| Inbox | `/api/inbox` | Real DB data | ✅ |
| Leads | `/api/leads` | Real DB data | ✅ |
| CRM | `/api/crm` | Real DB data | ✅ |
| Growth | 6 API calls | Real DB data | ✅ |
| Insights | `/api/analytics/insights` | Real Generated | ✅ |
| Funnels | `/api/analytics/overview` | Real DB data | ✅ |
| Content | `/api/content/top-posts` | Real + mock metrics | ⚠️ |
| Reputation | `/api/reputation/overview` | Real DB data | ✅ |
| Health | `/api/meta-health/overview` | Real DB data | ✅ |
| Approvals | `/api/approvals` | Real DB data | ✅ |
| Missed Opps | `/api/missed-opportunities` | Real DB data | ✅ |
| Re-engagement | `/api/n8n` + `/api/reengagement` | Real DB data | ✅ |
| Billing | `/api/subscription/*` | Real Razorpay | ✅ |
| Reports | `/api/reports/*` | Real DB data | ✅ |
| Settings | `/api/settings` + `/api/auth/me` | Real DB data | ✅ |
| Team | `/api/team` | Real DB data | ✅ |
| Success | `/api/customer-success/dashboard` | Real DB data | ✅ |
| Partner Portal | `/api/partners/portal` | Real DB data | ⚠️ |
| Automation | `/api/automation/triggers` | Real DB data | ✅ |

---

## Launch Readiness Checklist Summary

| # | Item | Status | Severity |
|---|------|--------|----------|
| 1 | Razorpay keys validated before use | ❌ MISSING | 🔴 |
| 2 | AI reply fallback when OpenAI unset | ❌ MISSING | 🔴 |
| 3 | Startup env var validation | ❌ MISSING | 🔴 |
| 4 | Worker Redis connection healthcheck | ❌ MISSING | 🔴 |
| 5 | Email verification on signup | ❌ MISSING | 🟡 |
| 6 | Password reset flow | ❌ MISSING | 🟡 |
| 7 | Approval mode actually publishes reply | ❌ BROKEN | 🟡 |
| 8 | Partner portal auth (not email-dependent) | ❌ FRAGILE | 🟡 |
| 9 | Content reach/likes/shares are real | ❌ MOCKED | 🟡 |
| 10 | Auto-like actually works | ❌ BROKEN | 🟡 |
| 11 | Token auto-refresh | ❌ MISSING | 🟢 |
| 12 | Webhook processing retry | ❌ MISSING | 🟢 |
| 13 | Escalation email notification | ❌ MISSING | 🟢 |
| 14 | Subscription proration | ❌ MISSING | 🟢 |
| 15 | Worker Docker healthcheck | ❌ MISSING | 🟢 |

---

## Recommendations (Priority Order)

### 🔴 Fix Before Launch (Items 1-4)
1. Add `config.ts` startup validation for required env vars (DATABASE_URL, REDIS_URL, JWT_SECRET, META_APP_ID, META_APP_SECRET, OPENAI_API_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
2. Wrap Razorpay client creation with graceful error message
3. Wrap AI reply calls with graceful fallback response
4. Add worker healthcheck for Redis connection

### 🟡 Fix Before First Paying Customer (Items 5-10)
5. Implement email verification & password reset
6. Fix approval mode to actually publish to Instagram/Facebook via Meta Graph API
7. Create proper partner authentication
8. Either implement real Meta API calls for content metrics or remove mocked fields
9. Either implement auto-like via Meta API or remove from UI

### 🟢 Ship and Patch (Items 11-14)
10. Add token auto-refresh (low effort, high value)
11. Add webhook retry mechanism
12. Add escalation email notification via Resend
13. Consider proration for upgrades
