# ADR-005 File storage

## Status

Accepted

## Context

Assignments and photos need files. Postgres should not store large blobs.

## Decision

`StorageProvider` interface (`put`/`get`). Default: `LocalStorageProvider` under `FILE_STORAGE_DIR`. Optional: `ObjectStorageProvider` (S3-compatible SigV4) when `STORAGE_PROVIDER=s3`. Metadata stays in `FileObject`. Callers do not change.

## Consequences

- VPS backups must include the data directory or object bucket
- Validation (size, MIME) at API boundary
