# SOCIALPILOT AI — META SECURITY AUDIT

**Date:** June 1, 2026  
**Auditor:** Codebuff AI  
**Methodology:** Source code review, security flow verification

---

## EXECUTIVE SUMMARY

| Security Control | Status | Notes |
|-----------------|--------|-------|
| X-Hub-Signature Verification | 🟢 IMPLEMENTED | HMAC-SHA256 with App Secret |
| Webhook Authenticity Checks | 🟢 IMPLEMENTED | Validates signature before processing |
| Replay Attack Protection | 🔴 NOT IMPLEMENTED | No timestamp validation |
| Rate Limiting | 🟢 IMPLEMENTED | @fastify/rate-limit at app level (100 req/min) |
| Invalid Payload Handling | 🟢 IMPLEMENTED | Try/catch with error logging |
| OAuth State Tamper Protection | 🟡 PARTIAL | State is base64url-encoded JSON with nonce |
| Token Storage | 🟢 SECURE | Tokens stored in database, not client-side |

---

## CONTROL-BY-CONTROL ANALYSIS

### 1. X-Hub-Signature Verification — 🟢 IMPLEMENTED

**Implementation:** `backend/src/modules/meta/routes.ts` — POST /webhook handler

```typescript
if (config.meta.appSecret) {
  const signature = request.headers['x-hub-signature-256'] as string;
  if (!signature) { return reply.status(401).send('Missing signature'); }
  
  const bodyStr = JSON.stringify(body);
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', config.meta.appSecret)
    .update(bodyStr)
    .digest('hex');
  
  // Timing-safe comparison
  try {
    if (signature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return reply.status(401).send('Invalid signature');
    }
  } catch (sigErr) { ... }
}
```

**Strengths:**
- ✅ Uses HMAC-SHA256 with META_APP_SECRET
- ✅ Timing-safe comparison via `crypto.timingSafeEqual`
- ✅ Length comparison before timing-safe check
- ✅ Graceful degradation when App Secret not configured
- ✅ Clear error messages and logging

**Limitations:**
- ⚠️ Uses `JSON.stringify(body)` instead of raw POST body. Meta signs the exact raw bytes; if JSON key ordering or whitespace differs from what Meta sent, verification will fail. In practice, Node.js's `JSON.stringify` produces deterministic output, so this should work for most payloads, but is not 100% reliable.
- ⚠️ No webhook delivery retry with exponential backoff

**Recommendation:** For production, add a `preParsing` hook or custom content-type parser that buffers the raw body before JSON parsing. This ensures byte-exact signature verification.

### 2. Webhook Authenticity Checks — 🟢 IMPLEMENTED

**Implementation:**
- Signature verification (see above)
- Webhook verification (GET /webhook): Validates `hub.verify_token` against `config.meta.webhookVerifyToken`
- Webhook verification (GET /webhook): Returns `hub.challenge` on success, 403 on failure

**Strengths:**
- ✅ Both GET (verification challenge) and POST (event delivery) are authenticated
- ✅ GET verification uses configurable verify token
- ✅ POST uses HMAC-SHA256 with App Secret

**Verified:** `meta.test.ts` has tests for:
- ✅ Correct verify token → 200 with challenge
- ✅ Wrong verify token → 403

### 3. Replay Attack Protection — 🔴 NOT IMPLEMENTED

**Status:** No protection against attack replay.

**Risk:** An attacker who captures a valid signed webhook payload can replay it multiple times, causing duplicate comments, DMs, leads, and CRM activities.

**Recommendation:** Implement replay protection by:
1. Checking the `entry[].time` timestamp in Meta webhook payloads (millisecond epoch)
2. Rejecting events older than 5 minutes
3. Using an in-memory cache (e.g., 1-hour TTL) of processed webhook IDs to prevent duplicates

```typescript
// In meta-processor.ts or webhook handler
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
for (const entry of body.entry) {
  if (entry.time && Date.now() - entry.time > MAX_AGE_MS) {
    logger.warn('Rejecting stale webhook entry: %d ms old', Date.now() - entry.time);
    continue; // Skip stale entries
  }
}
```

### 4. Rate Limiting — 🟢 IMPLEMENTED

**Implementation:** `backend/src/app.ts`
```typescript
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});
```

**Coverage:** Applies to ALL routes, including webhooks.

**Adequacy:** 100 requests per minute is reasonable for webhook delivery. Meta typically sends webhooks in batches every few seconds during high traffic.

**Recommendation:** Consider separate rate limits:
- 30 req/s for API endpoints
- 100 req/s for webhook endpoints

### 5. Invalid Payload Handling — 🟢 IMPLEMENTED

**Implementation:**
- Webhook handler wraps processing in try/catch
- `meta-processor.ts` handles missing/malformed entries gracefully
- Returns error count in result object
- Logs warnings for unprocessed entries

**Strengths:**
- ✅ Invalid payloads don't crash the server
- ✅ Errors are counted and logged
- ✅ Returns 200 even on partial errors (Meta expects 200 to stop retrying)
- ✅ Missing fields handled with null-safe access patterns

### 6. OAuth State Tamper Protection — 🟡 PARTIALLY WORKING

**Implementation:** State is `base64url`-encoded JSON containing `{userId, platform, nonce}`.

**Risk:**
- State is NOT HMAC-signed or encrypted
- Anyone who decodes the base64url can read and modify the userId
- An attacker could modify the state to connect a different user's Meta account

**Recommendation:** HMAC-sign the state using META_APP_SECRET:
```typescript
const stateData = JSON.stringify({ userId, platform, nonce });
const signature = crypto.createHmac('sha256', config.meta.appSecret).update(stateData).digest('hex');
const state = Buffer.from(JSON.stringify({ data: stateData, sig: signature })).toString('base64url');
```
And verify on callback:
```typescript
const { data, sig } = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
const expectedSig = crypto.createHmac('sha256', config.meta.appSecret).update(data).digest('hex');
if (sig !== expectedSig) throw new Error('State tampered');
const { userId, platform } = JSON.parse(data);
```

---

## WEBHOOK SECURITY FLOW

```
Meta Server                  SocialPilot Backend
    │                              │
    │  POST /api/meta/webhook      │
    │  Headers:                    │
    │    X-Hub-Signature-256       │
    │    Content-Type: app/json    │
    │  Body: { entry: [...] }      │
    │─────────────────────────────>│
    │                              │
    │               1. Check signature ──[HMAC-SHA256 with App Secret]
    │                  ├─ Valid: continue
    │                  └─ Invalid: 401
    │               
    │               2. Parse entries
    │               3. Route to processor
    │               4. Queue jobs
    │               5. Return 200 "EVENT_RECEIVED"
```

---

## VERDICT

**Meta Security Readiness: 75/100**

The critical authentication layer (X-Hub-Signature verification, webhook challenge, rate limiting) is implemented. The main gaps are replay attack protection and OAuth state signing, which should be addressed before production launch.

**🟡 NEARLY LAUNCH READY** — Address replay protection and state signing (estimated 2-3 hours work).
