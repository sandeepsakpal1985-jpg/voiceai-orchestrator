# ADR-005 File storage

## Status

Accepted

## Context

Assignments and photos need files. Postgres should not store large blobs.

## Decision

`FileStorage` interface. MVP: local filesystem under a data directory. Metadata in `FileObject`. Later: S3-compatible without changing callers.

## Consequences

- VPS backups must include the data directory or object bucket
- Validation (size, MIME) at API boundary
