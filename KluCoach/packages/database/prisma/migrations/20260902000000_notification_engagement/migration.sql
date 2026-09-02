-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "notifications" ADD COLUMN "student_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "href" TEXT NOT NULL DEFAULT '';
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" TEXT;

UPDATE "notifications" SET "dedupe_key" = "id" WHERE "dedupe_key" IS NULL;

ALTER TABLE "notifications" ALTER COLUMN "dedupe_key" SET NOT NULL;

CREATE UNIQUE INDEX "notifications_institution_id_user_id_dedupe_key_key" ON "notifications"("institution_id", "user_id", "dedupe_key");
CREATE INDEX "notifications_institution_id_user_id_read_at_idx" ON "notifications"("institution_id", "user_id", "read_at");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attendance_alerts" BOOLEAN NOT NULL DEFAULT true,
    "result_alerts" BOOLEAN NOT NULL DEFAULT true,
    "assignment_alerts" BOOLEAN NOT NULL DEFAULT true,
    "notice_alerts" BOOLEAN NOT NULL DEFAULT true,
    "timetable_alerts" BOOLEAN NOT NULL DEFAULT true,
    "fee_alerts" BOOLEAN NOT NULL DEFAULT false,
    "channel_in_app" BOOLEAN NOT NULL DEFAULT true,
    "channel_email" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");
CREATE INDEX "notification_preferences_institution_id_idx" ON "notification_preferences"("institution_id");

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
