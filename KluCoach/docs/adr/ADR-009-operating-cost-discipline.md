# ADR-009 Operating cost discipline

## Status

Accepted

## Context

Target realization is about ₹500/student/year. AI, video, and SMS at scale would erase margin.

## Decision

A feature that adds significant **variable cost per student** needs a corresponding revenue line (or must be institution-metered). MVP: no AI, no video, no default SMS. Prefer Postgres, local/object files, in-app notifications.

## Consequences

- AI parent chat is roadmap-only
- WhatsApp/SMS require explicit later integration and cost controls
