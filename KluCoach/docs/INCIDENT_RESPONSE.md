# Incident response

Keep these short. Record time, impact, and the request id from API errors.

## Database unavailable

`GET /ready` returns 503. Do not serve writes. Check Postgres container/disk. Restore from the last verified dump if the volume is lost ([BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md)).

## Payment provider unavailable

Checkout will fail. Invoices remain visible. Do not mark invoices paid from the browser. Retry order creation after Razorpay recovers. Reconciliation can confirm captures that arrived while the API was down.

## Webhook failure

Invalid signatures stay 400. Processing errors return 500 so Razorpay retries. Inspect `payment_webhook_events.processing_result`. Do not replay unsigned bodies.

## Email provider failure

In-app notifications still persist. SMTP errors are logged without dumping credentials. Use `POST /ops/email/verify` after fixing config.

## Storage failure

Local disk: restore the files volume. S3: check credentials/endpoint. Assignment metadata remains in Postgres; blobs may be missing until restore.

## Bad deployment

Roll back the image tag. If a migration already ran, restore the pre-deploy dump rather than editing old SQL.

## Failed migration

Leave the database as-is. Fix the new migration, deploy again. Never rewrite applied migration files.

## Security incident

Invalidate sessions (`DELETE FROM sessions` or restart after rotating `SESSION_SECRET` — rotation logs everyone out). Rotate payment/webhook/SMTP secrets at the provider. Preserve audit logs.
