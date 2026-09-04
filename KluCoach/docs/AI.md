# AI Student Insights

Phase 7 adds a read-only intelligence layer over already-authorized KluCoach data. AI is not a product, not a source of truth, and not a security boundary.

```
EXISTING DATA
      ↓
AUTHORIZED STUDENT 360 / batch / institution aggregates
      ↓
AI CONTEXT BUILDER
      ↓
LLM (or TestAiProvider)
      ↓
SAFE STRUCTURED RESPONSE
      ↓
USER
```

Authorization happens **before** context is built. The model never queries the database. The client never supplies student records.

---

## Endpoints

| Method | Path | Who |
|--------|------|-----|
| `GET` | `/ai/status` | Authenticated tenant user |
| `POST` | `/ai/students/:id/ask` | PARENT (linked child), STUDENT (self), TEACHER (assigned-batch enrollment), INSTITUTION_ADMIN (same tenant) |
| `POST` | `/ai/batches/:id/ask` | TEACHER (assigned batch only) |
| `POST` | `/ai/institution/ask` | INSTITUTION_ADMIN (session tenant) |

Request body: `{ message }` (1–500 characters). Extra keys such as `studentData` are stripped. The server builds context.

Response: `{ available, answer, citations, contextVersion, provider }`.

`SUPER_ADMIN` does not inherit student, batch, or institution AI from platform privileges.

---

## Context

`buildStudent360AiContext` compresses the existing Student 360 DTO: first name, attendance %, recent results, pending assignments, upcoming classes, notice titles, fee label. It omits ids, admission numbers, emails, phones, password hashes, and sibling records.

Teacher and admin contexts are compact aggregates (max 40 students per batch; institution counts + batch names). They are not a dump of Student 360 for every student.

Citations are generated from that context on the server. The model does not invent evidence rows.

---

## Safety

- Default `AI_ENABLED=false`. The API boots without a provider.
- No SQL generation, embeddings, vector database, or RAG.
- No autonomous writes (attendance, marks, assignments, notices, fees, subscriptions).
- Fee text may summarize authorized Student 360 fee status; billing remains authoritative.
- Prompts are versioned (`PARENT_STUDENT_360_V1`, `STUDENT_SELF_360_V1`, `TEACHER_BATCH_INSIGHTS_V1`, `ADMIN_INSTITUTION_INSIGHTS_V1`).
- User messages are untrusted text. Prompt injection cannot expand authorization because unauthorized rows never enter the context.

---

## Cost

AI is invoked only when a user clicks Ask. Opening Student 360 does not call a model.

Controls: `AI_MODEL`, `AI_MAX_OUTPUT_TOKENS` (default 400), `AI_MAX_INPUT_CHARS` (default 8000), 20 asks/minute/user in production (keyed by tenant + user). No conversation store in this phase. No background generation.

Future metering can count requests and tokens. This phase does not bill AI usage.

---

## Disabled and failure

| State | HTTP | Body |
|-------|------|------|
| `AI_ENABLED=false` | 200 | `{ available: false, answer: "AI assistance is not enabled for this environment." }` after authorization |
| Provider missing/unavailable | 503 | `AI_UNAVAILABLE` — safe message, no stack traces |

See [AI_PROVIDER_SETUP.md](./AI_PROVIDER_SETUP.md) and [ADR-018](./adr/ADR-018-ai-student-insights.md).
