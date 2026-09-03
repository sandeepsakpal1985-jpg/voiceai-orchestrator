# ADR-016 Job runner

## Status

Accepted

## Context

Phase 5 lifecycle apply was a super-admin POST. Production needs a repeatable hourly pass for grace/expiry and payment reconciliation.

## Decision

API process + worker process. PostgreSQL `job_runs` with a unique `dedupeKey` per job name + UTC hour. No Redis, Kafka, or Kubernetes. The worker loops hourly and is idempotent: a second claim in the same hour is a no-op.

## Consequences

At-most-one successful row per hour per job. Lifecycle status changes still only write when the computed status differs. Notifications keep the existing unique `dedupeKey`.
