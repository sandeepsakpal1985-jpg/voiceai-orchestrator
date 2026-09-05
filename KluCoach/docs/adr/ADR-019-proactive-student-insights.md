# ADR-019 Proactive Student Insights

## Status

Accepted

## Context

Phase 7 made AI an authorized read layer over Student 360: users ask, the server authorizes, then a model may explain already-visible facts. Parents still have to remember to ask. Phase 4 already delivers in-app notifications from domain events.

A predictive “at risk” engine would invent scores the product cannot defend, would be expensive at roughly ₹500/student/year, and would mix minors’ operational data with profiling.

## Decision

1. **Rules first.** Detect observable changes with thresholds: attendance %, published assessment averages, overdue assignments. No LLM decides whether a student is at risk. No risk/dropout/failure/behavior scores.
2. **Facts before copy.** Persist `StudentInsight` with a typed source object. Deterministic sentences use those numbers. Optional `INSIGHT_AI_WORDING` may only rephrase after the fact exists and must keep the numbers.
3. **Reuse notifications.** Recipients stay server-derived. Unique `(institutionId, studentId, dedupeKey)` on insights and `(institutionId, userId, dedupeKey)` on notifications. Retries must not spam.
4. **Reuse `job_runs`.** Job name `student.insights`. Callable `POST /insights/run` for development. Hourly worker invocation is configured only when the existing worker process is running — do not claim a separate scheduler.
5. **Same authorization as Student 360**, plus super-admin is denied insight reads. Tenant isolation is `institutionId` from the session.
6. **No new infrastructure.** No Redis, vector database, LangChain, or second notification system.
7. **Lifecycle is the unique row.** One durable `StudentInsight` per `(institutionId, studentId, dedupeKey)` is the active fact. No dismiss/resolve UI in this phase.
8. **Background from writes.** `scheduleStudentInsights` must remain fire-and-forget after attendance/results so academic saves cannot fail because insight detection failed.
9. **Thresholds are env-only for MVP.** No admin configuration UI.

## Consequences

- Insights work with AI disabled. Optional wording is visually distinct from the factual sentence when enabled; with AI off, only the factual sentence is shown.
- Trivial fluctuations below the configured threshold do not notify. Insufficient samples produce no insight.
- Insights are loaded with a sibling authorized fetch, not copied into `assembleStudent360`.
- Teacher batch-level aggregation UI is deferred (Phase 9) so this phase does not become an analytics engine.
- Live LLM wording remains optional and off by default.
