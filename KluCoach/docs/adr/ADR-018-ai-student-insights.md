# ADR-018 AI Student Insights

## Status

Accepted

## Context

Phases 1–6 established tenant isolation, RBAC, Student 360, notifications, and billing. Parents still combine those facts themselves. A generic “chat with the database” would undo that authorization work and would be expensive at roughly ₹500/student/year.

## Decision

1. **Intelligence layer, not a product.** AI sits on authorized Student 360 (and compact teacher/admin aggregates). It does not own data.
2. **Server is the security boundary.** Authenticate → resolve resource → authorize → build minimized context → call `AiProvider`. The model never sees unauthorized rows. Super-admin does not inherit student AI.
3. **Provider port.** `AiProvider.generateResponse` is domain-owned. `TestAiProvider` is deterministic. `OpenAiProvider` uses HTTPS fetch, not an SDK. No LangChain, LlamaIndex, embeddings, or vector database in this phase.
4. **Default off.** `AI_ENABLED=false`. Missing keys must not prevent boot. Production rejects `test` when AI is enabled.
5. **Explicit invocation.** No AI on Student 360 page load. Rate limits, input/output caps, and versioned prompts control cost and drift.
6. **Read-only.** No mutations, no invoice calculation, no medical/psychological labels.
7. **Citations from context.** Evidence rows are computed in KluCoach, not by the model.
8. **No chat history store.** One message per request. Persistence would need tenant/user/student scope and a retention cap.

## Consequences

- Prompt injection cannot grant extra data because extra data is never supplied.
- Live vendor quality is optional and blocked without keys.
- Future RAG (policies, notices, study material) and proactive notification insights can reuse this port after this interactive layer is validated.
