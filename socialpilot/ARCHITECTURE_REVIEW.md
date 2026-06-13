# SocialPilot AI — Architecture Review & OSS Integration Report

**Date:** May 30, 2026
**Author:** AI Architecture Review
**Status:** Draft for review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Assessment](#2-current-architecture-assessment)
3. [OSS Integration Opportunities](#3-oss-integration-opportunities)
4. [Time Savings Estimate](#4-time-savings-estimate)
5. [Refactoring Recommendations](#5-refactoring-recommendations)
6. [MVP Implementation Plan](#6-mvp-implementation-plan)
7. [End-to-End Workflow Plan](#7-end-to-end-workflow-plan)
8. [Exact Next Coding Tasks](#8-exact-next-coding-tasks)

---

## 1. Executive Summary

SocialPilot AI has a **solid code scaffold** with 16 backend modules, a full Prisma schema (18 models), AI services, background workers, and a Next.js frontend. However, several modules **reinvent the wheel** — building custom solutions for problems that mature open-source projects already solve.

**Key finding:** ~60% of the custom code could be replaced or augmented by OSS projects, cutting development time by an estimated **4-6 weeks** and dramatically reducing maintenance burden.

### Top Recommendations (ROI Ranked)

| Rank | OSS Project | Action | Time Saved | Complexity |
|------|-------------|--------|------------|------------|
| 1 | **Meta Business SDK** | Replace raw fetch() calls | ~1 week | Low |
| 2 | **Chatwoot** (headless) | Replace custom Inbox + DMs + Comments | ~3-4 weeks | Medium |
| 3 | **Mem0** | Replace custom MemoryService | ~1 week | Low |
| 4 | **n8n** | Replace re-engagement + notification scheduling | ~2 weeks | Medium |
| 5 | **Metabase** | Replace custom analytics engine | ~2 weeks | Medium |
| 6 | **Mastra** | Orchestrate AI pipeline | ~1 week | Low |
| 7 | **Open WebUI** (RAG only) | Enhance knowledge base | ~3 days | Low |
| 8 | **Twenty CRM** (schema patterns) | Inspirational only | N/A | None |

---

## 2. Current Architecture Assessment

### What's Working Well ✅

| Component | Assessment |
|-----------|------------|
| **Prisma Schema (18 models)** | Solid data model. Covers Users, Meta connections, Comments, DMs, Leads, CRM, Knowledge, Memory, Escalations, Subscriptions. Good foundation. |
| **Auth Module** | JWT + Google OAuth — standard, well-implemented. Keep as-is. |
| **Meta OAuth Flow** | Working OAuth with long-lived token exchange, Pages, Instagram Business accounts. Keep as-is. |
| **CTA Config** | Simple CRUD, well-scoped. Keep as-is. |
| **Team Management** | Simple invite/role system. Keep as-is. |
| **Brand Settings** | Clean single-row config. Keep as-is. |
| **Fastify Plugin Architecture** | Good modular registration pattern. Keep as-is. |
| **Frontend Auth Pages** | Clean login/register with Google OAuth button. Keep as-is. |

### What Needs Refactoring 🔧

| Component | Issue | Recommendation |
|-----------|-------|---------------|
| **Meta API calls (raw fetch)** | Scattered `fetch()` calls with manual URL construction in `meta/routes.ts` | Replace with **Meta Business SDK** |
| **Comments Module** | Custom CRUD + classification | Replace **inbox** with headless Chatwoot |
| **DMs Module** | Custom conversation + messages | Replace with headless Chatwoot |
| **Inbox Module** | Custom unified inbox | Replace with headless Chatwoot |
| **Memory Service** | Custom Prisma-based memory with basic upsert | Replace with **Mem0** for proper memory management |
| **Vector Service** | Thin Qdrant wrapper, no embedding pipeline | Enhance or keep with Mem0 integration |
| **Analytics Module** | Custom endpoint returning hardcoded metrics | Add **Metabase** embedding alongside |
| **Re-engagement Module** | Custom rule engine + BullMQ scheduling | Replace with **n8n** workflows |
| **AI Pipeline** | Scattered classifier → response → action calls | Orchestrate with **Mastra** workflows |
| **Knowledge Module** | Simple CRUD with no embedding/retrieval | Enhance with **Open WebUI** RAG patterns |
| **BullMQ Workers** | 3 custom workers (comment, dm, re-engagement) | Consolidate — keep comment + DM, move re-engagement to n8n |

### What's Missing 🚨

| Feature | Status | Priority |
|---------|--------|----------|
| Real Meta webhook processing | Stubbed (stores raw payloads only) | **Critical** |
| End-to-end comment → reply flow | Partially built (classifier exists but not wired) | **Critical** |
| End-to-end DM → AI reply flow | Partially built | **Critical** |
| Lead enrichment from conversations | Not wired | High |
| CRM deal auto-creation from qualified leads | Not wired | High |
| Analytics with real data | Empty shell | Medium |
| Error handling + retry logic | Minimal | Medium |

---

## 3. OSS Integration Opportunities

### 3.1 Chatwoot — Unified Inbox (HEADLESS MODE)

**Recommendation:** 🟢 **Adopt (headless backend only)**

| Metric | Value |
|--------|-------|
| **Complexity** | Medium (3-4 days integration) |
| **Time Saved** | **3-4 weeks** of custom inbox development |
| **License** | MIT — fully commercial-friendly |
| **Self-hosted** | Yes (Docker Compose) |

**Why:** SocialPilot's Inbox, Comments, and DMs modules are essentially a **lightweight helpdesk** — exactly what Chatwoot excels at. Instead of building a unified inbox from scratch, use Chatwoot as a **headless backend**:

- **Conversation management:** Chatwoot handles threading, assignments, status, notes
- **Multi-channel:** Native Instagram + Messenger support via Meta API
- **AI integration:** Webhook → AI → API reply pattern
- **Labels:** Replace custom category/tag system

**Integration approach:**
1. Self-host Chatwoot via Docker Compose (MySQL/PostgreSQL + Rails app)
2. Use Chatwoot Platform API for all conversation operations
3. Wire webhooks → AI classifier → Chatwoot API for replies
4. Build a thin UI adapter layer (don't embed Chatwoot's UI — use its API)

**Risks:**
- Adds another service to the infrastructure (Rails app)
- Chatwoot's Instagram integration uses the same Meta API — might have token sync issues
- Custom categorization logic would need to map to Chatwoot labels

**Current code to replace:**
- `backend/src/modules/inbox/` — entire module
- `backend/src/modules/comments/` — most of it (keep classifier)
- `backend/src/modules/dms/` — most of it (keep AI response generation)

---

### 3.2 Mem0 — Customer Memory Engine

**Recommendation:** 🟢 **Adopt (direct integration)**

| Metric | Value |
|--------|-------|
| **Complexity** | Low (2-3 days integration) |
| **Time Saved** | **1 week** of custom memory development |
| **License** | Apache 2.0 — commercial-friendly |
| **Self-hosted** | Yes (uses Qdrant/Milvus) |

**Why:** The current `MemoryService` is a simple Prisma upsert with basic journey tracking — it lacks semantic memory, preference learning, and intelligent retrieval. Mem0 provides:

- **Memory extraction:** Automatically extracts entities, preferences from conversations
- **Semantic retrieval:** Vector-based memory search (aligns with existing Qdrant)
- **Dynamic updating:** Updates/merges memories as new info arrives
- **Multi-tenant:** Built-in `user_id` scoping

**Integration approach:**
1. Install `mem0ai` npm package
2. Configure Mem0 to use existing Qdrant instance as vector store
3. Replace `MemoryService` calls with Mem0 API (`memory.add()`, `memory.search()`)
4. Keep Prisma `CustomerMemory` model for structured data (name, email, phone)
5. Use Mem0 for conversational context + preference learning

**Risks:**
- Mem0 is relatively new — API may evolve
- Adds another layer between app and Qdrant
- Requires embedding model configuration

---

### 3.3 Metabase — Embedded Analytics

**Recommendation:** 🟡 **Adopt (complementary, not replacement)**

| Metric | Value |
|--------|-------|
| **Complexity** | Medium (3-5 days integration) |
| **Time Saved** | **2 weeks** of custom analytics dev |
| **License** | AGPL (self-hosted free) / Paid for embedding |
| **Self-hosted** | Yes (Java app via Docker) |

**Why:** The current Analytics module returns basic JSON metrics. Metabase can provide rich visual dashboards with filtering, drill-down, and scheduled reports. However, it's best as a **complement** rather than replacement — keep the REST API for programmatic access and add Metabase embeddings for rich visualizations.

**Integration approach:**
1. Self-host Metabase via Docker Compose (point to the same PostgreSQL DB)
2. Create dashboards in Metabase (Leads pipeline, Conversion funnel, etc.)
3. Use JWT-based signed embedding for authenticated user access
4. Keep `/api/analytics` endpoints for mobile/API access
5. **Note:** Paid plan needed for production embedding features

**Risks:**
- AGPL license requires open-sourcing modifications if self-hosted
- Embedding features require paid Pro plan (~$575/mo)
- Another Docker service to manage
- Row-level security must be carefully configured for multi-tenant

---

### 3.4 Mastra — AI Agent Orchestration

**Recommendation:** 🟢 **Adopt (for pipeline orchestration)**

| Metric | Value |
|--------|-------|
| **Complexity** | Low (2-3 days integration) |
| **Time Saved** | **1 week** of custom orchestration logic |
| **License** | MIT — commercial-friendly |
| **Self-hosted** | Yes (npm library — no extra infra) |

**Why:** The current AI pipeline (classify → respond → store memory → create lead → update CRM) is scattered across multiple modules with no central orchestration. Mastra provides a **code-first workflow engine** that's perfect for this:

- **Workflow steps:** Define each pipeline step as a typed function
- **State management:** Automatic state passing between steps
- **LLM integration:** Built-in support for OpenAI, Anthropic, etc.
- **Tools:** Define tools for Prisma, Chatwoot API, etc.
- **Mastra Studio:** Visual debugging during development

**Integration approach:**
1. Install `mastra` package in backend
2. Create a `CommentPipeline` workflow:
   - Step 1: Classify comment (LLM)
   - Step 2: Extract lead info (LLM)
   - Step 3: Create/update lead (Prisma tool)
   - Step 4: Update Mem0 memory (Mem0 tool)
   - Step 5: Generate AI reply (LLM)
   - Step 6: Post reply (Chatwoot API / Meta API tool)
   - Step 7: Create/update CRM deal (Prisma tool)
3. Replace scattered BullMQ worker logic with Mastra workflows

**Risks:**
- Mastra is very new (early 2025 release) — API stability concerns
- Community size is small — limited support resources
- May need fallback to raw LLM calls for complex logic

---

### 3.5 Twenty CRM — Schema Patterns (INSPIRATIONAL ONLY)

**Recommendation:** 🔵 **Study, don't integrate**

| Metric | Value |
|--------|-------|
| **Complexity** | N/A (reading only) |
| **Time Saved** | Minor (schema design ideas) |
| **License** | AGPL-3.0 (too restrictive for integration) |
| **Self-hosted** | Yes (Docker — 4GB+ RAM required) |

**Why:** Twenty CRM has excellent schema design for contacts, deals, pipelines, and activities. The SocialPilot CRM module is already well-structured, but can benefit from:

- **Activity timeline patterns:** How Twenty tracks multi-type activities per deal
- **Pipeline stage progression:** Advanced stage transition logic
- **Field customization:** Their metadata-driven approach (not directly applicable, but instructive)

**Do NOT integrate Twenty directly** — AGPL license, heavy infrastructure requirements, and significant scope overlap.

---

### 3.6 Open WebUI — Knowledge Base / RAG

**Recommendation:** 🟡 **Adopt patterns, not the platform**

| Metric | Value |
|--------|-------|
| **Complexity** | Low (1-2 days reading patterns) |
| **Time Saved** | **3 days** implementing RAG pipeline |
| **License** | MIT |
| **Self-hosted** | Yes (Docker) |

**Why:** Open WebUI's RAG implementation is solid (document ingestion → chunking → embeddings → retrieval), but it's **single-tenant** and primarily a UI app. Instead of running the full platform:

- **Adopt the architectural patterns:**
  - Document chunking strategy (overlapping chunks)
  - Embedding pipeline (using existing Qdrant)
  - Retrieval augmentation in system prompts
- **Don't adopt the platform** — single-tenant, UI-focused, adds unnecessary infrastructure

**Current code to enhance:**
- `backend/src/services/knowledge/` — add chunking + embedding pipeline
- `backend/src/services/vector/vector-service.ts` — already exists, just needs embedding integration

---

### 3.7 n8n — Workflow Automation (Re-engagement + Notifications)

**Recommendation:** 🟢 **Adopt (for scheduled workflows)**

| Metric | Value |
|--------|-------|
| **Complexity** | Medium (3-5 days) |
| **Time Saved** | **2 weeks** of custom scheduling logic |
| **License** | Sustainable Use License (free for internal use) |
| **Self-hosted** | Yes (Docker — Node.js app) |

**Why:** The re-engagement module (24h/3d/7d follow-ups) and notification scheduling are classic **workflow automation** problems that n8n excels at:

- **Scheduled triggers:** Cron-based lead scanning
- **Webhook triggers:** Real-time event processing
- **Database nodes:** Query PostgreSQL for dormant leads
- **AI nodes:** Generate personalized messages
- **HTTP nodes:** Send to Chatwoot/Meta APIs
- **Multi-tenant:** Pass `tenant_id` as context variable

**Integration approach:**
1. Self-host n8n via Docker Compose
2. Create n8n workflows for:
   - **Re-engagement:** Daily scan → filter dormant leads → generate AI message → send DM
   - **Missed opportunity alerts:** Webhook → notify team
   - **Escalation routing:** Webhook → assign based on rules
   - **Analytics reporting:** Weekly summary → email report
3. Keep BullMQ for real-time processing (comments, DMs)
4. Move scheduled/background tasks to n8n

**Risks:**
- SUL license prohibits selling n8n as a service (fine for internal use)
- Multi-tenancy requires careful architecture (pass tenant_id through workflows)
- Adds another Docker service to manage
- Workflows are UI-configured — harder to version control

---

### 3.8 Meta Business SDK

**Recommendation:** 🟢 **Adopt (partially)**

| Metric | Value |
|--------|-------|
| **Complexity** | Low (1-2 days refactoring) |
| **Time Saved** | **1 week** of API maintenance |
| **License** | MIT (it's an SDK, not a service) |
| **Self-hosted** | N/A (just an npm package) |

**Why:** The current `meta/routes.ts` uses raw `fetch()` calls with manual URL construction, error handling, and pagination. The Meta Business SDK provides:

- **Structured API calls:** `new FacebookAdsApi().init(token)` pattern
- **Pagination handling:** Built-in pagination for large result sets
- **Error handling:** Structured error objects
- **Type definitions:** Community DefinitelyTyped package available

**Integration approach:**
1. Install `facebook-nodejs-business-sdk` + `@types/facebook-nodejs-business-sdk`
2. Replace `exchangeCodeForToken()`, `exchangeForLongLivedToken()`, `getUserPages()`, `getInstagramBusinessAccount()` with SDK equivalents
3. Keep the OAuth flow structure (redirect → callback → store token)
4. Add Instagram Content API for comment reading/reply

**IMPORTANT NOTE:** The Business SDK **does NOT** cover Instagram comment reading, DM sending, or content publishing. For those, you still need raw Graph API calls. The SDK is primarily for Ads/Marketing/Business Management APIs. So use it **only for the parts it covers** and keep raw fetch for social content APIs.

**Risks:**
- Limited scope (Ads/Marketing focused) — many endpoints still need raw fetch
- Community types may lag behind API changes
- Adds a dependency that may not save much code for simple calls

---

## 4. Time Savings Estimate

### Integration Effort vs. Custom Development

| Module | Custom Dev Time | OSS Integration Time | Time Saved | Confidence |
|--------|----------------|---------------------|------------|------------|
| Unified Inbox (Chatwoot) | 4 weeks | 4 days | **~3.5 weeks** | High |
| Customer Memory (Mem0) | 1 week | 2 days | **~4 days** | High |
| Embedded Analytics (Metabase) | 2 weeks | 4 days | **~1.5 weeks** | Medium |
| AI Pipeline (Mastra) | 1 week | 2 days | **~4 days** | Medium |
| Re-engagement (n8n) | 2 weeks | 4 days | **~1.5 weeks** | High |
| Meta API calls (SDK) | Ongoing maint. | 1 day | **Ongoing** | High |
| RAG Knowledge (Open WebUI patterns) | 3 days | 1 day | **~2 days** | Medium |
| **Total** | **~11 weeks** | **~3 weeks** | **~8 weeks saved** | |

### Cost-Benefit Analysis

| OSS Project | Integration Cost | Infra Cost | Maintenance | ROI Score (1-10) |
|-------------|-----------------|------------|-------------|-------------------|
| Chatwoot | Medium | Medium (Rails app) | Low | **9/10** |
| Mem0 | Low | None (uses Qdrant) | Low | **9/10** |
| Metabase | Medium | Medium (Java app) | Low | **6/10** (paid) |
| Mastra | Low | None (npm lib) | Medium (new) | **7/10** |
| n8n | Medium | Medium (Node app) | Medium | **8/10** |
| Meta SDK | Low | None | Low | **5/10** (limited) |
| Open WebUI patterns | Low | None | Low | **5/10** (patterns only) |

---

## 5. Refactoring Recommendations

### Keep As-Is 🟢

| Module | Rationale |
|--------|-----------|
| **Auth** (JWT + Google OAuth) | Standard, well-implemented, no OSS replacement needed |
| **Team Management** | Simple CRUD, tightly coupled to app |
| **CTA Config** | Minimal code, product-specific |
| **Brand Settings** | Simple single-row config |
| **Onboarding** | Tightly coupled to product flow |
| **Escalation** | Simple ticket system, works fine |
| **Notifications** | Minimal in-app notifications |
| **Admin** | Thin wrapper on usage stats |
| **Lead CRUD** | Product-specific scoring + categorization |
| **CRM Deals** | Product-specific pipeline stages |

### Refactor 🔧

| Module | Action |
|--------|--------|
| **Comments** | Keep AI classifier, replace CRUD + reply with Chatwoot API |
| **DMs** | Keep AI response gen, replace conversation management with Chatwoot |
| **Inbox** | Entirely replace with Chatwoot Platform API |
| **Memory Service** | Wrap Mem0, keep Prisma for structured fields only |
| **Re-engagement** | Move to n8n workflows |
| **Analytics** | Keep REST endpoints, add Metabase embedding |

### Delete 🗑️

| Module | Replacement |
|--------|-------------|
| `inbox/routes.ts` | Chatwoot API |
| `dms/routes.ts` (most) | Chatwoot API |
| `comments/routes.ts` (most) | Chatwoot API |
| `reengagement/routes.ts` | n8n workflows |
| BullMQ re-engagement worker | n8n |

---

## 6. MVP Implementation Plan

### Phase 1 — Core Workflow (Weeks 1-2) ⭐ MUST HAVE

**Goal:** End-to-end Instagram comment → AI reply → Lead → CRM working with REAL data

| Step | Task | Dependencies | Est. Time |
|------|------|-------------|-----------|
| 1.1 | Replace raw Meta fetch() with SDK + proper Instagram comments API | None | 2 days |
| 1.2 | Implement real Meta webhook processing (comments + messages) | 1.1 | 2 days |
| 1.3 | Wire comment webhook → classifier → AI reply → post reply | 1.2 | 2 days |
| 1.4 | Wire DM webhook → AI response → memory update → send reply | 1.2 | 2 days |
| 1.5 | Auto-create Lead from qualified comments/DMs | 1.3, 1.4 | 1 day |
| 1.6 | Auto-create CRM Deal from qualified leads | 1.5 | 1 day |
| 1.7 | Integrate Mem0 for persistent customer memory | 1.4 | 2 days |

**Total Phase 1: ~12 days**

### Phase 2 — Chatwoot Inbox Integration (Week 3)

| Step | Task | Dependencies | Est. Time |
|------|------|-------------|-----------|
| 2.1 | Deploy Chatwoot via Docker Compose | None | 1 day |
| 2.2 | Migrate conversation data (comments + DMs) to Chatwoot | 2.1 | 2 days |
| 2.3 | Wire Meta webhooks → Chatwoot conversations | 2.1, 1.2 | 1 day |
| 2.4 | Build UI adapter layer (fetch conversations via Chatwoot API) | 2.1 | 1 day |
| 2.5 | Remove old inbox/comments/dms modules | 2.4 | 1 day |

**Total Phase 2: ~6 days**

### Phase 3 — Analytics + Re-engagement (Week 4)

| Step | Task | Dependencies | Est. Time |
|------|------|-------------|-----------|
| 3.1 | Deploy Metabase + configure data sources | None | 1 day |
| 3.2 | Create lead/CRM/analytics dashboards in Metabase | 3.1 | 2 days |
| 3.3 | Implement JWT-based embedding in frontend | 3.2 | 1 day |
| 3.4 | Deploy n8n + create re-engagement workflows | None | 2 days |
| 3.5 | Create escalation + notification workflows in n8n | 3.4 | 1 day |

**Total Phase 3: ~7 days**

### Phase 4 — Pipeline Orchestration + Polish (Week 5)

| Step | Task | Dependencies | Est. Time |
|------|------|-------------|-----------|
| 4.1 | Create Mastra workflows for AI pipeline | 1.3-1.6 | 2 days |
| 4.2 | Add RAG knowledge base using Open WebUI patterns | None | 2 days |
| 4.3 | Error handling, retry logic, monitoring | All | 1 day |
| 4.4 | UI polish for core workflow pages | All | 2 days |

**Total Phase 4: ~7 days**

---

## 7. End-to-End Workflow Plan

### Instagram Comment → CRM Deal (Real, No Mock Data)

```
Instagram User Comments on a Post
        │
        ▼
┌─────────────────────────────┐
│ Meta Webhook (POST /webhook)│  ← Already implemented (stores raw payload)
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Webhook Processor            │  ← NEW: Parse entry → identify comment
│ • Parse comment payload      │
│ • Get comment text, author   │
│ • Store in Chatwoot conv     │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ AI Classifier (Mastra step) │  ← Already exists (classifyComment)
│ • Categorize comment        │
│ • Score: lead, urgency, etc │
│ • Detect sales intent       │
└──────────┬──────────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
  Lead?       Not Lead?
     │           │
     │           ▼
     │     ┌─────────────────────┐
     │     │ Standard AI Reply   │  ← Already have LLM service
     │     │ (no lead tracking)  │
     │     └──────────┬──────────┘
     │                │
     │                ▼
     │         Reply to comment via Meta API
     │
     ▼
┌─────────────────────────────┐
│ Lead Creator                 │  ← NEW: Auto-create from comment
│ • Create Lead in DB          │
│ • Set category (hot/warm)    │
│ • Tag based on intent        │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Mem0 Memory Update           │  ← Replace MemoryService
│ • Store customer profile     │
│ • Track conversation context │
│ • Learn preferences          │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ AI Reply Generator           │  ← Already have (context-builder + LLM)
│ • Build system prompt        │
│ • Include memory context     │
│ • Generate personalized msg  │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Reply via Meta API           │  ← NEW: Wire to actual API
│ • POST reply to comment      │
│ • Mark as replied in DB      │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Lead → CRM Deal Converter   │  ← Already have endpoint (needs auto-trigger)
│ • Create CRM Deal            │
│ • Link to Lead               │
│ • Set pipeline stage         │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ Dashboard + Analytics Update│  ← Phase 3 (Metabase)
│ • Update metrics             │
│ • Refresh charts             │
└─────────────────────────────┘
```

### Key Decision Points

| Decision | Logic |
|----------|-------|
| **Lead threshold** | `leadScore > 50` → auto-create lead |
| **Reply timing** | 45-90s random delay (human-like) — already implemented |
| **CRM deal** | `leadScore > 70` → auto-create CRM deal |
| **Escalation** | `escalationScore > 80` OR negative sentiment + complaint → human |
| **DM follow-up** | After initial reply, wait for user response |
| **Re-engagement** | No response in 24h/3d/7d → n8n workflow |

---

## 8. Exact Next Coding Tasks

### Task 1: Wire Meta Webhook Processing (2 days) 🥇 HIGHEST PRIORITY

**What:** The webhook endpoint stores raw payloads but does nothing with them. Need to parse and route.

**Files to modify:**
- `backend/src/modules/meta/routes.ts` — `POST /webhook` handler
- `backend/src/services/queue/queue-service.ts` — add webhook job

**Implementation:**
1. Parse incoming webhook entries by `field` (comments, messages, mentions)
2. Create a webhook processor service:
   - If `field === 'comments'` → add to comment processing queue
   - If `field === 'messages'` → add to DM processing queue
3. Link `MetaWebhook` records to actual user connections (resolve from page ID)

### Task 2: Wire Comment → AI Reply → Post (2 days) 🥇 HIGHEST PRIORITY

**What:** After webhook creates a comment, the worker should classify, generate reply, and post it.

**Files to modify:**
- `workers/src/comment.worker.ts` — the existing BullMQ worker
- `backend/src/modules/comments/routes.ts` — ensure endpoints exist

**Implementation:**
1. In comment worker:
   - Call `classifyComment()` — already exists
   - Call `generateCompletion()` with context — already exists
   - Post reply via Meta Graph API `POST /{comment-id}/replies`
   - Update comment status to `replied`
   - If leadScore > threshold, auto-create lead

### Task 3: Integrate Mem0 (2 days)

**Files to modify:**
- `backend/package.json` — add `mem0ai`
- `backend/src/services/memory/memory-service.ts` — replace implementation

**Implementation:**
1. `npm install mem0ai`
2. Configure Mem0 client with OpenAI embeddings + Qdrant storage
3. Rewrite `MemoryService`:
   - `addMemory()` → `memory.add()` with user_id scoping
   - `getRelevantMemory()` → `memory.search()` for context
   - Keep Prisma `CustomerMemory` for structured fields only

### Task 4: Auto-create Lead + CRM Deal from Comments (1 day)

**Files to modify:**
- `workers/src/comment.worker.ts` — add lead creation logic
- `backend/src/services/ai/classifier.ts` — ensure leadScore is reliable

**Implementation:**
1. After classification, if `leadScore > 50`:
   - Create `Lead` record with extracted info
2. If `leadScore > 70`:
   - Create `CRMDeal` linked to lead
3. Update `CustomerMemory` with new lead info

### Task 5: Integrate Meta Business SDK (partial, 1 day)

**Files to modify:**
- `backend/package.json` — add `facebook-nodejs-business-sdk`
- `backend/src/modules/meta/routes.ts` — refactor token exchange

**Implementation:**
1. `npm install facebook-nodejs-business-sdk`
2. Replace `exchangeCodeForToken()` and `exchangeForLongLivedToken()` with SDK calls
3. Keep raw `fetch()` for Instagram comment/message APIs (SDK doesn't cover these)

### Task 6: Mastra Pipeline Orchestration (2 days)

**Files to modify:**
- `backend/package.json` — add `mastra`
- `backend/src/services/ai/` — new `workflows/` directory

**Implementation:**
1. Create Mastra workflow: `CommentPipeline`
2. Steps: Classify → LeadCheck → MemoryUpdate → GenerateReply → PostReply → CRMUpdate
3. Wire webhook processor to trigger workflow instead of direct function calls

---

## Appendix: Infrastructure Changes

### New Docker Services Required

| Service | Purpose | Resource Usage | Docker Image |
|---------|---------|---------------|-------------|
| Chatwoot | Unified inbox | 2GB RAM, PostgreSQL | `chatwoot/chatwoot:latest` |
| Metabase (optional Phase 3) | Embedded analytics | 1GB RAM, Java | `metabase/metabase:latest` |
| n8n (optional Phase 3) | Workflow automation | 512MB RAM | `n8nio/n8n:latest` |

### Docker Compose additions:

```yaml
chatwoot:
  image: chatwoot/chatwoot:latest
  depends_on: [postgres, redis]
  environment:
    - POSTGRES_DATABASE_URL=postgres://.../chatwoot
    - REDIS_URL=redis://redis:6379
    - SECRET_KEY_BASE=...
    - FRONTEND_URL=http://localhost:3000
  ports: ["3001:3000"]

n8n:
  image: n8nio/n8n:latest
  depends_on: [postgres, redis]
  environment:
    - DB_TYPE=postgresdb
    - DB_POSTGRESDB_DATABASE=n8n
  ports: ["5678:5678"]

metabase:
  image: metabase/metabase:latest
  depends_on: [postgres]
  environment:
    - MB_DB_TYPE=postgres
    - MB_DB_DBNAME=metabase
  ports: ["3002:3000"]
```

### Removed/Consolidated

| Component | Status |
|-----------|--------|
| BullMQ re-engagement worker | Remove (replace with n8n) |
| Inbox module | Remove (replace with Chatwoot) |
| Comments module CRUD | Reduce (keep classifier only) |
| DMs module conversation mgmt | Reduce (keep AI response gen only) |

---

*This report was generated as part of an architecture review. All recommendations should be validated against current project requirements before implementation.*
