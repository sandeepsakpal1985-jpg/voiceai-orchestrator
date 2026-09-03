-- Phase 6: password reset, provider payment fields, webhooks, jobs, reconciliation

CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_payments" ADD COLUMN "provider_payment_id" TEXT;
ALTER TABLE "billing_payments" ADD COLUMN "provider_order_id" TEXT;
ALTER TABLE "billing_payments" ADD COLUMN "provider_status" TEXT;
ALTER TABLE "billing_payments" ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "billing_payments" ADD COLUMN "failure_reason" TEXT;
ALTER TABLE "billing_payments" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "billing_payments_provider_provider_payment_id_idx" ON "billing_payments"("provider", "provider_payment_id");
CREATE INDEX "billing_payments_provider_provider_order_id_idx" ON "billing_payments"("provider", "provider_order_id");

CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processing_result" TEXT NOT NULL,
    "invoice_id" TEXT,
    "payment_id" TEXT,
    "payload_hash" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");
CREATE INDEX "payment_webhook_events_created_at_idx" ON "payment_webhook_events"("created_at");

CREATE TABLE "payment_reconciliations" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "local_status" TEXT NOT NULL,
    "provider_status" TEXT NOT NULL,
    "mismatch" BOOLEAN NOT NULL,
    "notes" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_reconciliations_invoice_id_idx" ON "payment_reconciliations"("invoice_id");
CREATE INDEX "payment_reconciliations_created_at_idx" ON "payment_reconciliations"("created_at");

CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_runs_dedupe_key_key" ON "job_runs"("dedupe_key");
CREATE INDEX "job_runs_name_created_at_idx" ON "job_runs"("name", "created_at");
