# MetaPilot AI — Customer Memory Verification

> Generated: June 1, 2026
> Scope: Verify that returning Instagram/Facebook users get full historical context

---

## Test Methodology

We verified the customer memory system by tracing the full data flow:
1. When a DM comment arrives → webhook processor creates/updates conversation
2. DM pipeline step 2 (`memoryStep`) → upserts `CustomerMemory` record
3. DM pipeline step 4 (`replyStep`) → loads Mem0 semantic memories, recent messages
4. Response is generated with full historical context in the system prompt

---

## Verified Memory Fields

| Memory Field | Source | Loaded on Return? | Notes |
|---|---|---|---|
| Previous conversations count | `CustomerMemory.previousConversations` | ✅ Yes | Incremented on each interaction via `upsert()` |
| Lead status (category) | `CustomerMemory.maxLeadScore` + `relationshipStatus` | ✅ Yes | Stored as `new`/`returning`/`customer`/`vip` |
| Previous sentiment | `CustomerMemory.recentSentiment` | ✅ Yes | Float -1.0 to 1.0, updated per interaction |
| Journey stage | `CustomerMemory.journey[]` | ✅ Yes | Array of steps like `started_dm`, `asked_pricing` |
| Tags | `CustomerMemory.tags[]` | ✅ Yes | Accumulated across sessions |
| Semantic memories | Mem0 Qdrant vector store | ✅ Yes | Searched with `searchSemanticMemories()` by user+customer |
| Recent conversation history | `DMConversation.messages` (last 5) | ✅ Yes | Loaded via `getConversationSummary()` or inline query |
| CTA click history | ❌ Not stored per-customer | ⚠️ Missing | CTA tracking endpoint doesn't persist per-customer |
| Purchase intent history | ❌ Not in `CustomerMemory` model | ⚠️ Missing | `purchaseProbability` stored on conversation, not memory |

---

## Data Flow Verification

### DM Pipeline (Full Context)

```
Step 1: classify-dm
  → Classifies intent, sets leadScore, purchaseProbability, urgencyScore

Step 2: update-memory
  → Upserts CustomerMemory: increments conversations, updates score, journey, tags, relationshipStatus

Step 3: create-lead
  → Creates/updates Lead with latest score and tags

Step 4: generate-reply
  → Loads conversation context (last 3 messages)
  → Searches Mem0 semantic memories for relevant past interactions (limit: 5)
  → Builds system prompt with:
    - Intent, lead score, purchase probability, urgency
    - Recent conversation transcript
    - Semantic memory context ("[AI REMEMBERS]" section)
    - Instructions to personalize based on remembered context
  → Generates AI response

Step 5: store-reply
  → Stores AI response as DMMessage
  → Stores interaction in Mem0 semantic memory for future recall
```

### Comment Pipeline (Limited Context)

```
Step 1: classify-comment
  → Classifies category, sentiment, leadScore, urgencyScore, escalationScore

Step 2: create-lead
  → Creates/updates Lead (no CustomerMemory upsert)

Step 3: generate-reply
  → Loads knowledge documents (FAQ) for context
  → Builds system prompt with category, sentiment, leadScore, escalationScore
  → Does NOT load CustomerMemory or semantic memories
  → Does NOT include lead context in reply

Step 4: update-comment
  → Updates comment with classification and AI reply
```

**Gap:** Comment pipeline doesn't load `CustomerMemory` or Mem0 semantic memories before generating replies. If a returning customer comments again, the AI won't know about previous interactions.

---

## Recommendations

1. **Fix comment pipeline:** Add `memoryStep` to comment pipeline that loads CustomerMemory + Mem0 memories before generating replies
2. **Add CTA tracking:** Create `CTAHistory` model or store CTA clicks in `CustomerMemory.metadata`
3. **Store purchase intent:** Add `purchaseProbability` and `purchaseIntent` to `CustomerMemory` model
4. **Add memory context to comment replies:** Include customer name, relationship status, and previous interaction summary in comment reply prompts
