import { prisma } from "@klunex-edu/database";
import {
  MOVEMENT_DUPLICATE_WINDOW_MS,
  MOVEMENT_RETENTION_DAYS,
  movementListSchema,
  type MovementEventType,
} from "@klunex-edu/shared";
import { notFound, unauthorized, validationError } from "../../lib/errors.js";
import { writeSystemAudit } from "../audit/write.js";
import {
  deliverNotification,
  hrefForRole,
  parentsForStudent,
} from "../communication/notification-service.js";
import { isDuplicateScan, movementCopy, resolveMovementType } from "./rules.js";
import argon2 from "argon2";

function isUniqueConflict(err: unknown) {
  return Boolean(err && typeof err === "object" && "code" in err && String((err as { code: unknown }).code) === "P2002");
}

function utcDay(value: Date) {
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function outsideSchedule(institutionId: string, studentId: string, occurredAt: Date) {
  const enrollments = await prisma.batchEnrollment.findMany({
    where: { studentId },
    select: { batchId: true },
  });
  const batchIds = enrollments.map((e) => e.batchId);
  if (!batchIds.length) return true;
  const day = utcDay(occurredAt);
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);
  const session = await prisma.classSession.findFirst({
    where: {
      institutionId,
      batchId: { in: batchIds },
      date: { gte: day, lt: next },
      status: "SCHEDULED",
    },
    select: { id: true },
  });
  return !session;
}

async function notifyMovement(
  institutionId: string,
  studentId: string,
  type: "ENTRY" | "EXIT",
  eventId: string,
  firstName: string,
  institutionName: string,
) {
  const copy = movementCopy(type, firstName, institutionName);
  const noticeType = type === "ENTRY" ? "MOVEMENT_ENTRY" : "MOVEMENT_EXIT";
  const parents = await parentsForStudent(institutionId, studentId);
  for (const p of parents) {
    await deliverNotification({
      institutionId,
      userId: p.userId,
      email: p.email,
      studentId,
      type: noticeType,
      kind: "movement",
      title: copy.title,
      body: copy.body,
      href: hrefForRole("PARENT", studentId),
      dedupeKey: `${noticeType}:${eventId}:${p.userId}`,
      payload: { movementEventId: eventId },
    });
  }
}

export async function ingestScan(input: {
  deviceId: string;
  deviceSecret: string;
  uid: string;
  requestedType?: "ENTRY" | "EXIT";
  occurredAt?: Date;
}) {
  const uid = input.uid.trim();
  if (!uid) throw validationError("uid required");
  const device = await prisma.accessDevice.findFirst({
    where: { id: input.deviceId, status: "ACTIVE" },
    include: { gate: true, institution: { select: { name: true } } },
  });
  if (!device) throw unauthorized();
  const ok = await argon2.verify(device.secretHash, input.deviceSecret);
  if (!ok) throw unauthorized();
  await prisma.accessDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return recordScan({
    institutionId: device.institutionId,
    institutionName: device.institution.name,
    gateId: device.gateId,
    deviceId: device.id,
    uid,
    requestedType: input.requestedType,
    occurredAt: input.occurredAt ?? new Date(),
    source: "DEVICE",
  });
}

export async function adminPunch(input: {
  institutionId: string;
  institutionName: string;
  studentId: string;
  gateId: string;
  type: "ENTRY" | "EXIT";
  occurredAt?: Date;
}) {
  const gate = await prisma.accessGate.findFirst({
    where: { id: input.gateId, institutionId: input.institutionId, status: "ACTIVE" },
  });
  if (!gate) throw notFound();
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, institutionId: input.institutionId },
  });
  if (!student) throw notFound();
  const credential = await prisma.studentCredential.findFirst({
    where: { institutionId: input.institutionId, studentId: student.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  return recordScan({
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    gateId: gate.id,
    deviceId: null,
    uid: credential?.uid ?? `admin:${student.id}`,
    requestedType: input.type,
    occurredAt: input.occurredAt ?? new Date(),
    source: "ADMIN_TEST",
    studentId: student.id,
  });
}

async function recordScan(input: {
  institutionId: string;
  institutionName: string;
  gateId: string;
  deviceId: string | null;
  uid: string;
  requestedType?: "ENTRY" | "EXIT";
  occurredAt: Date;
  source: "DEVICE" | "ADMIN_TEST";
  studentId?: string;
}) {
  const credential = input.studentId
    ? null
    : await prisma.studentCredential.findFirst({
        where: { institutionId: input.institutionId, uid: input.uid, status: "ACTIVE" },
      });
  const studentId = input.studentId ?? credential?.studentId ?? null;
  if (!studentId) {
    try {
      const event = await prisma.movementEvent.create({
        data: {
          institutionId: input.institutionId,
          studentId: null,
          gateId: input.gateId,
          deviceId: input.deviceId,
          type: "UNKNOWN_CARD",
          source: input.source,
          credentialUid: input.uid,
          outsideSchedule: false,
          dedupeKey: `UNKNOWN:${input.deviceId ?? "admin"}:${input.uid}:${input.occurredAt.toISOString()}`,
          occurredAt: input.occurredAt,
        },
      });
      await writeSystemAudit({
        action: "movement.unknown_card",
        entityType: "MovementEvent",
        entityId: event.id,
        institutionId: input.institutionId,
        metadata: { gateId: input.gateId },
      });
      return { type: "UNKNOWN_CARD" as const, eventId: event.id, notified: false };
    } catch (err) {
      if (isUniqueConflict(err)) return { type: "UNKNOWN_CARD" as const, eventId: "", notified: false };
      throw err;
    }
  }

  const last = await prisma.movementEvent.findFirst({
    where: {
      institutionId: input.institutionId,
      studentId,
      gateId: input.gateId,
      type: { in: ["ENTRY", "EXIT"] },
    },
    orderBy: { occurredAt: "desc" },
  });
  const type = resolveMovementType(input.requestedType, last?.type ?? null);
  if (last && last.type === type && isDuplicateScan(last.occurredAt, input.occurredAt)) {
    try {
      const event = await prisma.movementEvent.create({
        data: {
          institutionId: input.institutionId,
          studentId,
          gateId: input.gateId,
          deviceId: input.deviceId,
          type: "DUPLICATE_SCAN",
          source: input.source,
          credentialUid: input.uid,
          outsideSchedule: false,
          dedupeKey: `DUP:${input.gateId}:${studentId}:${type}:${last.id}`,
          occurredAt: input.occurredAt,
        },
      });
      return { type: "DUPLICATE_SCAN" as const, eventId: event.id, notified: false };
    } catch (err) {
      if (isUniqueConflict(err)) return { type: "DUPLICATE_SCAN" as const, eventId: last.id, notified: false };
      throw err;
    }
  }

  const offSchedule = await outsideSchedule(input.institutionId, studentId, input.occurredAt);
  const event = await prisma.movementEvent.create({
    data: {
      institutionId: input.institutionId,
      studentId,
      gateId: input.gateId,
      deviceId: input.deviceId,
      type,
      source: input.source,
      credentialUid: input.uid,
      outsideSchedule: offSchedule,
      dedupeKey: `${type}:${input.gateId}:${studentId}:${input.occurredAt.toISOString()}`,
      occurredAt: input.occurredAt,
    },
  });
  const student = await prisma.student.findFirst({ where: { id: studentId }, select: { firstName: true } });
  await notifyMovement(
    input.institutionId,
    studentId,
    type,
    event.id,
    student?.firstName ?? "Student",
    input.institutionName,
  );
  await writeSystemAudit({
    action: type === "ENTRY" ? "movement.entry" : "movement.exit",
    entityType: "MovementEvent",
    entityId: event.id,
    institutionId: input.institutionId,
    metadata: { studentId, gateId: input.gateId, outsideSchedule: offSchedule },
  });
  return { type, eventId: event.id, notified: true, outsideSchedule: offSchedule };
}

export async function listStudentMovement(institutionId: string, studentId: string) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - MOVEMENT_RETENTION_DAYS);
  const rows = await prisma.movementEvent.findMany({
    where: {
      institutionId,
      studentId,
      type: { in: ["ENTRY", "EXIT"] },
      occurredAt: { gte: since },
    },
    include: { gate: true, institution: { select: { name: true } } },
    orderBy: { occurredAt: "desc" },
    take: 40,
  });
  return movementListSchema.parse({
    items: rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      type: row.type as MovementEventType,
      gateName: row.gate.name,
      institutionName: row.institution.name,
      occurredAt: row.occurredAt.toISOString(),
      outsideSchedule: row.outsideSchedule,
      source: row.source,
    })),
  });
}

export async function listTodayMovement(institutionId: string) {
  const day = utcDay(new Date());
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);
  const rows = await prisma.movementEvent.findMany({
    where: { institutionId, occurredAt: { gte: day, lt: next } },
    include: { gate: true, student: { select: { firstName: true, lastName: true } } },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      gateName: row.gate.name,
      studentName: row.student ? `${row.student.firstName} ${row.student.lastName}` : null,
      occurredAt: row.occurredAt.toISOString(),
      outsideSchedule: row.outsideSchedule,
    })),
  };
}

export { MOVEMENT_DUPLICATE_WINDOW_MS };
