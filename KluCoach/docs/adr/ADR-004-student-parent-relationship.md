# ADR-004 Student–parent relationship

## Status

Accepted

## Context

A student may have many guardians. A parent account may have many children. Modeling “one parent field on student” is wrong.

## Decision

- `Guardian` person record (may exist before login)
- `User` login (optional until invitation accepted)
- `StudentGuardian` join: student, guardian, relationship, primary flag
- Parent session lists children via this join, same institution only

## Consequences

- Import must create/link guardians without requiring accounts first
- Minors: guardian relationship is authoritative for parent-app access
