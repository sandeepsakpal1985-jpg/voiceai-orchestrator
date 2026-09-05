ALTER TABLE "notification_preferences" ADD COLUMN "movement_alerts" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "access_gates" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_gates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "access_devices" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "gate_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_credentials" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RFID',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "movement_events" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "student_id" TEXT,
    "gate_id" TEXT NOT NULL,
    "device_id" TEXT,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DEVICE',
    "credential_uid" TEXT NOT NULL,
    "outside_schedule" BOOLEAN NOT NULL DEFAULT false,
    "dedupe_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movement_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_gates_institution_id_code_key" ON "access_gates"("institution_id", "code");
CREATE INDEX "access_gates_institution_id_idx" ON "access_gates"("institution_id");
CREATE INDEX "access_devices_institution_id_idx" ON "access_devices"("institution_id");
CREATE UNIQUE INDEX "student_credentials_institution_id_uid_key" ON "student_credentials"("institution_id", "uid");
CREATE INDEX "student_credentials_institution_id_student_id_idx" ON "student_credentials"("institution_id", "student_id");
CREATE UNIQUE INDEX "movement_events_institution_id_dedupe_key_key" ON "movement_events"("institution_id", "dedupe_key");
CREATE INDEX "movement_events_institution_id_student_id_occurred_at_idx" ON "movement_events"("institution_id", "student_id", "occurred_at");
CREATE INDEX "movement_events_institution_id_occurred_at_idx" ON "movement_events"("institution_id", "occurred_at");

ALTER TABLE "access_gates" ADD CONSTRAINT "access_gates_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_devices" ADD CONSTRAINT "access_devices_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_devices" ADD CONSTRAINT "access_devices_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "access_gates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_credentials" ADD CONSTRAINT "student_credentials_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_credentials" ADD CONSTRAINT "student_credentials_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "movement_events" ADD CONSTRAINT "movement_events_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "movement_events" ADD CONSTRAINT "movement_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "movement_events" ADD CONSTRAINT "movement_events_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "access_gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movement_events" ADD CONSTRAINT "movement_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "access_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
