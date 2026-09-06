# Backup and recovery

This document states engineering intent, not a contractual SLA. Values assume a single VPS + Docker Compose + PostgreSQL 16.

## Targets (realistic for a single VPS)

| Item | Value |
|------|--------|
| Backup frequency | Daily `pg_dump` (custom format `-Fc`) plus the file-storage volume |
| Retention | 7 daily, 4 weekly |
| Encryption | Encrypt dumps at rest if the off-box store supports it (for example age/gpg or bucket SSE) |
| RPO | About 24 hours with daily dumps. Tighter RPO needs WAL archiving, which this phase does not run. |
| RTO | About 1–2 hours for a practiced restore onto a warm VPS |

Do not claim point-in-time recovery unless WAL archiving is actually configured.

## What to back up

1. PostgreSQL (`pg_dump -Fc`)
2. File storage directory or S3 bucket (`FILE_STORAGE_DIR` / `STORAGE_PROVIDER=s3`)
3. Secrets from the production secret store (not from git)

Database credentials used for backups should not be the application role where practical.

## Dump

```bash
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc -f "klucoach-$(date -u +%Y%m%d).dump" "$PGDATABASE"
```

Production Compose does not expose Postgres publicly. Run dumps from a sidecar or SSH to the host and `docker compose exec postgres pg_dump ...`.

## Restore

1. Stop api and worker.
2. Restore onto an empty database (`pg_restore --no-owner -d klucoach file.dump`).
3. Restore files to `FILE_STORAGE_DIR` or the object bucket.
4. Run `prisma migrate deploy` only if the dump is from an older schema.
5. Start api/worker and hit `/ready`.

Never use `prisma db push` in production.

## Verification

A backup that has never been restored is not validated.

Script: `scripts/verify-backup.ps1` (requires `pg_dump`/`psql` on PATH). When Postgres runs in Compose, prefer:

```bash
docker compose exec -T postgres sh -c "pg_dump -U klucoach -Fc -f /tmp/klucoach-backup-verify.dump klucoach && dropdb -U klucoach --if-exists klucoach_restore_check && createdb -U klucoach klucoach_restore_check && pg_restore -U klucoach --no-owner -d klucoach_restore_check /tmp/klucoach-backup-verify.dump && psql -U klucoach -d klucoach_restore_check -tAc 'SELECT count(*) FROM institutions;' && dropdb -U klucoach klucoach_restore_check"
```

Executed 2026-09-02: restore database counted **2** institutions, then dropped. `RESTORE_VERIFIED`.

Executed 2026-09-05 (Phase 10): `pg_dump -Fc` of local `klucoach` on `localhost:55433` produced a 449674-byte custom dump (`DUMP_OK`). Full `scripts/verify-backup.ps1` restore-to-copy was not re-run in that session (operator confirmation). Prior restore drill remains the restore evidence.
