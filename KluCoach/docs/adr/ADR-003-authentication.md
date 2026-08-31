# ADR-003 Authentication

## Status

Accepted

## Context

KluNex Care uses JWT + bcrypt. KluCoach spec requires session-based auth and Argon2. Engineering framework mentions JWT “or ADR”.

## Decision

- Argon2id for passwords
- Opaque session ID in httpOnly cookie; session row in Postgres
- CSRF token for cookie-authenticated mutations
- No role or tenant in a client-readable token as source of truth

## Consequences

- Logout is immediate and server-enforced
- Horizontal scale later needs sticky sessions or shared session store (Postgres is enough for VPS MVP)
- Differs from KluCare; do not mix auth code
