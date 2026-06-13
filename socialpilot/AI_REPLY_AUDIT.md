# AI Reply Quality Audit — MetaPilot AI

> **Objective:** Verify AI replies use real knowledge base data, customer memory, and proper escalation detection — not just generic responses.

## Pipeline Architecture

```
Comment/DM arrives (webhook)
  → Classifier (intent, sentiment, urgency, lead score)
  → Context Builder (FAQ knowledge + customer memory + brand settings)
  → Reply Generation (LLM with context)
  → Lead Creation (if score > 50)
  → CRM Deal Creation (if score > 70)
```

## Audit Results

### 1. Comment Replies
**Status:** ✅ Contextual with FAQ + brand settings + personality

**What the pipeline does:**
1. **Classifier** analyzes the comment for: intent (sales_inquiry, complaint, pricing, product_info, etc.), sentiment score, urgency score, lead score, escalation score
2. **Context Builder** assembles: FAQ knowledge documents (vector search via Qdrant), customer memory from past interactions, brand settings (personality, tone, business name), CTA config
3. **LLM generates** a reply with: the customer message, the business context, the personality tone, a suggested CTA if appropriate

**What was verified:**
- `context-builder.ts` correctly queries `KnowledgeDocument` by userId for FAQ context
- `memory-service.ts` correctly queries `CustomerMemory` for past interactions
- Personality presets (5 tones) with specific temperature and system prompts
- CTA insertion logic: appends best matching CTA to qualified replies

### 2. DM Replies
**Status:** ✅ Contextual with customer memory + knowledge + conversation history

**What the pipeline does:**
1. **Classifier** analyzes the DM for intent and lead scoring
2. **Context Builder** loads: conversation history (last 10 messages), customer memory (past purchases, sentiment, tags), FAQ knowledge, brand settings
3. **Mastra DM Pipeline** (5 steps): classify → update customer memory → create lead → generate AI reply → store reply + Mem0
4. **Mem0** adds semantic memory for long-term recall across sessions

**What was verified:**
- DM pipeline includes: `classifyIntent` → `updateMemory` → `createLead` → `generateReply` → `storeReply` + `storeMem0Memory`
- Customer memory updates track: conversation count, lead score, sentiment, relationship status
- Mem0 integration stores: user_id, agent_id, customer_info, conversation_context

### 3. Knowledge Base Usage
**Status:** ✅ FAQ context actually injected into AI prompts

**How it works:**
- `context-builder.ts` calls `vectorService.searchSimilar()` to find relevant FAQ docs
- Results are injected as: `Here is the relevant business context:\n{FAQ content}`
- If no relevant FAQ is found, the AI falls back to general brand context

**What was verified:**
- Context builder queries Qdrant vector store with user's FAQ embeddings
- Returns top 3 most similar documents
- Formats them as context for the LLM

### 4. Customer Memory Usage
**Status:** ✅ Memory used in both comment and DM pipelines

**How it works:**
- `CustomerMemory` model tracks: past conversations, past purchases, lead score history, sentiment history, tags, relationship status, journey stages
- Context builder includes: `Customer Context:\nHandle: @username\nRelationship: returning\nPast conversations: 3\nPrevious purchases: 1\nRecent sentiment: positive`
- DM pipeline updates memory after each interaction

**What was verified:**
- Memory is queried per-customer before generating replies
- Memory is updated after each AI interaction
- Mem0 provides long-term semantic recall

### 5. Escalation Detection
**Status:** ✅ 8 threat patterns detected, AI auto-paused on escalation

**How it works:**
- `MetaWebhookProcessor.detectEscalation()` checks for 8 patterns: legal, refund, chargeback, police, media, fraud, privacy, abuse
- If detected: creates `EscalationTicket` with severity, sets `aiPaused: true`, sets `reputationAlert: true`
- No AI reply is queued for escalated conversations
- WebSocket broadcast to dashboard in real-time

**What was verified:**
- Escalation detection runs in both `handleComment()` and `handleDirectMessage()` methods
- `aiPaused` flag prevents AI from responding
- Reputation alerts are surfaced in Reputation dashboard

### 6. Approval Mode
**Status:** ✅ Generates draft, queues for approval, WebSocket notified

**How it works:**
- When `approvalModeType` is `approval_required` or `hybrid`, the worker creates an `ApprovalRequest` instead of publishing directly
- Approval requests include: draft content, confidence score, customer info, original message
- After approval: the reply should be posted to Instagram/Facebook (see audit finding below)

**⚠️ Gap Found: Approval mode doesn't actually publish to social media**
- When business owner approves a reply, it's marked "approved" in the database
- **No Meta Graph API call is made** to actually post the reply as a comment
- The `socialComment.replyStatus` remains `pending`

### 7. Are Replies Generic?
**Status:** No — replies are contextual with business-specific knowledge

**Risk of generic replies:** Low. The context builder injects actual FAQ documents, brand name, personality, and customer memory into every prompt. Without any FAQ uploaded, replies would be more generic (LLM general knowledge only).

### 8. Fallback Behavior
**Status:** ⚠️ No graceful fallback when OpenAI is unavailable

If `OPENAI_API_KEY` is not set, or the OpenAI API returns an error:
- Workers will throw unhandled exceptions
- No "AI is not available" fallback response
- No retry mechanism with backoff

## Summary

| Aspect | Score | Notes |
|--------|-------|-------|
| Contextual replies | ✅ | FAQ + brand + personality injected |
| Customer memory | ✅ | Per-customer memory + Mem0 semantic |
| Escalation detection | ✅ | 8 threat patterns with auto-pause |
| Approval mode | ⚠️ | Drafts created but not actually published |
| Fault tolerance | ❌ | No fallback if OpenAI unavailable |
| Knowledge base | ✅ | Qdrant vector search for FAQ similarity |

## Critical Fix Required

1. **Approval mode must actually publish** — After approval, the reply needs to be posted via Meta Graph API
2. **Fallback response** — Workers should return a safe "AI is not available" message instead of crashing when OpenAI is unconfigured
