-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "EntitlementStatus" ADD VALUE 'GRACE';

-- AlterTable institutions
ALTER TABLE "institutions" ADD COLUMN "billing_mode" TEXT NOT NULL DEFAULT 'LIVE';

-- AlterTable subscription_plans
ALTER TABLE "subscription_plans" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_plans" ADD COLUMN "product" TEXT NOT NULL DEFAULT 'KLUCOACH';
ALTER TABLE "subscription_plans" ADD COLUMN "billing_period" TEXT NOT NULL DEFAULT 'ANNUAL';
ALTER TABLE "subscription_plans" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "subscription_plans" ADD COLUMN "commercial_mode" TEXT NOT NULL DEFAULT 'PARTNER';
ALTER TABLE "subscription_plans" ADD COLUMN "list_price_paise" INTEGER;
ALTER TABLE "subscription_plans" ADD COLUMN "effective_from" TIMESTAMP(3);
ALTER TABLE "subscription_plans" ADD COLUMN "effective_to" TIMESTAMP(3);

UPDATE "subscription_plans"
SET "list_price_paise" = CASE
  WHEN "code" = 'PARTNER' THEN 199900
  ELSE "amount_paise_per_student_year"
END,
"commercial_mode" = CASE WHEN "code" = 'PARTNER' THEN 'PARTNER' ELSE 'DIRECT' END;

ALTER TABLE "subscription_plans" ALTER COLUMN "list_price_paise" SET NOT NULL;

-- AlterTable tenant_subscriptions snapshots
ALTER TABLE "tenant_subscriptions" ADD COLUMN "renewal_date" DATE;
ALTER TABLE "tenant_subscriptions" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "tenant_subscriptions" ADD COLUMN "commercial_mode" TEXT NOT NULL DEFAULT 'PARTNER';
ALTER TABLE "tenant_subscriptions" ADD COLUMN "student_unit_price_paise" INTEGER;
ALTER TABLE "tenant_subscriptions" ADD COLUMN "klunex_unit_realization_paise" INTEGER;
ALTER TABLE "tenant_subscriptions" ADD COLUMN "partner_unit_share_paise" INTEGER;
ALTER TABLE "tenant_subscriptions" ADD COLUMN "included_students" INTEGER;
ALTER TABLE "tenant_subscriptions" ADD COLUMN "grace_period_days" INTEGER NOT NULL DEFAULT 7;

UPDATE "tenant_subscriptions" AS ts
SET
  "student_unit_price_paise" = sp."amount_paise_per_student_year",
  "klunex_unit_realization_paise" = sp."klunex_share_paise",
  "partner_unit_share_paise" = sp."partner_share_paise",
  "commercial_mode" = sp."commercial_mode",
  "currency" = sp."currency"
FROM "subscription_plans" AS sp
WHERE sp."id" = ts."plan_id";

ALTER TABLE "tenant_subscriptions" ALTER COLUMN "student_unit_price_paise" SET NOT NULL;
ALTER TABLE "tenant_subscriptions" ALTER COLUMN "klunex_unit_realization_paise" SET NOT NULL;
ALTER TABLE "tenant_subscriptions" ALTER COLUMN "partner_unit_share_paise" SET NOT NULL;

ALTER TABLE "tenant_subscriptions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tenant_subscriptions" ALTER COLUMN "status" TYPE "SubscriptionStatus" USING (
  CASE "status"::text
    WHEN 'EXPIRED' THEN 'EXPIRED'::"SubscriptionStatus"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"SubscriptionStatus"
    ELSE 'ACTIVE'::"SubscriptionStatus"
  END
);
ALTER TABLE "tenant_subscriptions" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

CREATE INDEX "tenant_subscriptions_status_idx" ON "tenant_subscriptions"("status");

-- AlterTable student_entitlements
ALTER TABLE "student_entitlements" ADD COLUMN "unit_price_paise" INTEGER;
ALTER TABLE "student_entitlements" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "student_entitlements" AS se
SET "unit_price_paise" = ts."student_unit_price_paise"
FROM "tenant_subscriptions" AS ts
WHERE ts."id" = se."subscription_id";

UPDATE "student_entitlements" SET "unit_price_paise" = 0 WHERE "unit_price_paise" IS NULL;
ALTER TABLE "student_entitlements" ALTER COLUMN "unit_price_paise" SET NOT NULL;

CREATE UNIQUE INDEX "student_entitlements_subscription_id_student_id_key" ON "student_entitlements"("subscription_id", "student_id");
CREATE INDEX "student_entitlements_institution_id_status_idx" ON "student_entitlements"("institution_id", "status");

-- CreateTable platform_billing_config
CREATE TABLE "platform_billing_config" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billing_period" TEXT NOT NULL DEFAULT 'ANNUAL',
    "grace_period_days" INTEGER NOT NULL DEFAULT 7,
    "billable_student_statuses" TEXT[] DEFAULT ARRAY['ACTIVE']::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_billing_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_billing_config" ("id", "updated_at") VALUES ('platform', CURRENT_TIMESTAMP);

-- CreateTable billing_invoices
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal_paise" INTEGER NOT NULL,
    "discount_paise" INTEGER NOT NULL DEFAULT 0,
    "tax_paise" INTEGER NOT NULL DEFAULT 0,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "total_paise" INTEGER NOT NULL,
    "paid_paise" INTEGER NOT NULL DEFAULT 0,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_invoices_institution_id_invoice_number_key" ON "billing_invoices"("institution_id", "invoice_number");
CREATE UNIQUE INDEX "billing_invoices_institution_id_dedupe_key_key" ON "billing_invoices"("institution_id", "dedupe_key");
CREATE INDEX "billing_invoices_institution_id_created_at_idx" ON "billing_invoices"("institution_id", "created_at");
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices"("status");

CREATE TABLE "billing_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "student_count" INTEGER NOT NULL,
    "unit_price_paise" INTEGER NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_invoice_lines_invoice_id_idx" ON "billing_invoice_lines"("invoice_id");

CREATE TABLE "billing_payments" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_date" DATE NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" "BillingPaymentStatus" NOT NULL DEFAULT 'SUCCESS',
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "provider_reference" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_payments_institution_id_dedupe_key_key" ON "billing_payments"("institution_id", "dedupe_key");
CREATE INDEX "billing_payments_institution_id_idx" ON "billing_payments"("institution_id");
CREATE INDEX "billing_payments_invoice_id_idx" ON "billing_payments"("invoice_id");

CREATE TABLE "billing_refunds" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "reason" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_refunds_payment_id_dedupe_key_key" ON "billing_refunds"("payment_id", "dedupe_key");
CREATE INDEX "billing_refunds_invoice_id_idx" ON "billing_refunds"("invoice_id");

ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "tenant_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "billing_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
