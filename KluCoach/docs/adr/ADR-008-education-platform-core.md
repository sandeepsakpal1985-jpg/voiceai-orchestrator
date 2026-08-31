# ADR-008 Education platform core vs KluCoach

## Status

Accepted

## Context

Calling the database and modules “KluCoach-only” would force a rewrite for KluSchool.

## Decision

Internal architecture name: **KluNex Education Platform**. KluCoach is the commercial product and the `COACHING` institution mode. Shared entities (Institution, Student, Attendance, Assessment, …) live in core. Mode-specific workflows live under `products/coach` (and future `school` / `college`).

## Consequences

- Slightly more abstract names (`Program` not `CoachingCourse` as the only model)
- MVP can still use coaching copy in the UI
