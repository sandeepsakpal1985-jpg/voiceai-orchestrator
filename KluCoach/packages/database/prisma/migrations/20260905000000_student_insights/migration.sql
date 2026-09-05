-- CreateTable
CREATE TABLE "student_insights" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" JSONB NOT NULL DEFAULT '{}',
    "dedupe_key" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_insights_institution_id_student_id_dedupe_key_key" ON "student_insights"("institution_id", "student_id", "dedupe_key");
CREATE INDEX "student_insights_institution_id_student_id_detected_at_idx" ON "student_insights"("institution_id", "student_id", "detected_at");
CREATE INDEX "student_insights_institution_id_type_idx" ON "student_insights"("institution_id", "type");

ALTER TABLE "student_insights" ADD CONSTRAINT "student_insights_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_insights" ADD CONSTRAINT "student_insights_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
