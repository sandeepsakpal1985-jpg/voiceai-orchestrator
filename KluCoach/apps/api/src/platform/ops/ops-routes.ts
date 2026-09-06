import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { notFound, validationError } from "../../lib/errors.js";
import { rateLimits } from "../../lib/rateLimits.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { studentInTenant } from "../tenancy/scope.js";
import { parentStudentIds, assertParentOwnsStudent } from "../identity/scope.js";
import { writeAudit } from "../audit/write.js";
import { parseSpreadsheet, SpreadsheetParseError } from "../import/parseSpreadsheet.js";
import {
  missingRequiredColumns,
  sheetExceedsImportLimit,
  STUDENT_IMPORT_MAX_ROWS,
  STUDENT_IMPORT_PREVIEW_ERROR_LIMIT,
  STUDENT_IMPORT_STORED_ERROR_LIMIT,
  validateStudentImport,
  type StudentImportRecord,
} from "../import/validateStudentImport.js";

export async function opsRoutes(app: FastifyInstance) {
  app.get("/search", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "search:read");
    const q = ((req.query as { q?: string }).q ?? "").trim();
    if (q.length < 2) return { students: [], parents: [], teachers: [], batches: [] };
    const institutionId = tenant.institutionId;
    const [students, parents, teachers, batches] = await Promise.all([
      prisma.student.findMany({
        where: {
          institutionId,
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { admissionNumber: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
      }),
      prisma.guardian.findMany({
        where: { institutionId, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
        take: 10,
      }),
      prisma.teacher.findMany({
        where: { institutionId, name: { contains: q, mode: "insensitive" } },
        take: 10,
      }),
      prisma.batch.findMany({
        where: { institutionId, name: { contains: q, mode: "insensitive" } },
        take: 10,
      }),
    ]);
    return { students, parents, teachers, batches };
  });

  app.get("/reports/students.csv", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "reports:read");
    const students = await prisma.student.findMany({
      where: { institutionId: tenant.institutionId },
      include: { branch: true },
    });
    const header = "admissionNumber,firstName,lastName,status,branch\n";
    const body = students
      .map((s) => [s.admissionNumber, s.firstName, s.lastName, s.status, s.branch.name].join(","))
      .join("\n");
    await writeAudit(req, "report.export", "Student", null, { kind: "students.csv" });
    return reply.header("content-type", "text/csv").send(header + body);
  });

  app.get("/reports/attendance.csv", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "reports:read");
    const rows = await prisma.attendanceRecord.findMany({
      where: { institutionId: tenant.institutionId },
      include: { student: true },
      take: 5000,
    });
    const header = "date,admissionNumber,student,status\n";
    const body = rows
      .map((r) => [r.date.toISOString().slice(0, 10), r.student.admissionNumber, `${r.student.firstName} ${r.student.lastName}`, r.status].join(","))
      .join("\n");
    await writeAudit(req, "report.export", "AttendanceRecord", null);
    return reply.header("content-type", "text/csv").send(header + body);
  });

  app.get("/reports/parent-activation.csv", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "reports:read");
    const guardians = await prisma.guardian.findMany({
      where: { institutionId: tenant.institutionId },
      include: { user: true, students: { include: { student: true } } },
    });
    const header = "guardian,email,activated,students\n";
    const body = guardians
      .map((g) => [g.name, g.email ?? "", g.userId ? "yes" : "no", g.students.map((s) => s.student.admissionNumber).join("|")].join(","))
      .join("\n");
    return reply.header("content-type", "text/csv").send(header + body);
  });

  app.post("/imports/students/preview", { config: { rateLimit: rateLimits.importPreview } }, async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "import:write");
    const file = await req.file();
    if (!file) throw validationError("CSV or XLSX file required");
    const buf = await file.toBuffer();
    let sheet;
    try {
      sheet = await parseSpreadsheet(buf, file.filename);
    } catch (err) {
      if (err instanceof SpreadsheetParseError) throw validationError(err.message);
      throw err;
    }
    if (sheet.rows.length === 0) throw validationError("Spreadsheet has no data rows");
    if (sheetExceedsImportLimit(sheet.rows.length)) {
      throw validationError(`Too many rows (${sheet.rows.length}). Maximum is ${STUDENT_IMPORT_MAX_ROWS} per import.`);
    }
    const missing = missingRequiredColumns(sheet.headers);
    if (missing.length) throw validationError(`Missing columns: ${missing.join(", ")}`);

    const admissions = sheet.rows.map((row) => row[sheet.headers.indexOf("admissionNumber")] ?? "").filter(Boolean);
    const [branches, batches, existing] = await Promise.all([
      prisma.branch.findMany({ where: { institutionId: tenant.institutionId }, select: { name: true } }),
      prisma.batch.findMany({ where: { institutionId: tenant.institutionId }, select: { name: true } }),
      prisma.student.findMany({
        where: { institutionId: tenant.institutionId, admissionNumber: { in: admissions } },
        select: { admissionNumber: true },
      }),
    ]);
    const { valid, errors } = validateStudentImport(sheet, {
      branchNames: new Set(branches.map((b) => b.name)),
      batchNames: new Set(batches.map((b) => b.name)),
      existingAdmissionNumbers: new Set(existing.map((s) => s.admissionNumber)),
    });
    const job = await prisma.importJob.create({
      data: {
        institutionId: tenant.institutionId,
        createdById: tenant.id,
        status: "VALIDATED",
        fileName: file.filename,
        totalRows: sheet.rows.length,
        validRows: valid.length,
        errorRows: errors.length,
        payload: valid,
        errors: { create: errors.slice(0, STUDENT_IMPORT_STORED_ERROR_LIMIT) },
      },
      include: { errors: true },
    });
    return reply.code(200).send({
      jobId: job.id,
      total: job.totalRows,
      valid: job.validRows,
      errorCount: errors.length,
      errors: errors.slice(0, STUDENT_IMPORT_PREVIEW_ERROR_LIMIT),
      errorTruncated: errors.length > STUDENT_IMPORT_PREVIEW_ERROR_LIMIT,
      partialImport: true,
      partialImportNote: "Only valid rows are committed. Invalid rows are skipped and listed. A malformed row does not change other rows.",
    });
  });

  app.post("/imports/students/:jobId/commit", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "import:write");
    const { jobId } = req.params as { jobId: string };
    const job = await prisma.importJob.findFirst({
      where: { id: jobId, institutionId: tenant.institutionId },
    });
    if (!job) throw notFound();
    if (job.status === "COMMITTED") throw validationError("Already committed");
    const rows = job.payload as StudentImportRecord[];
    const created = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const rec of rows) {
        const branch = await tx.branch.findFirst({
          where: { institutionId: tenant.institutionId, name: rec.branchName },
        });
        const batch = await tx.batch.findFirst({
          where: { institutionId: tenant.institutionId, name: rec.batchName },
        });
        if (!branch || !batch) {
          throw validationError(
            `Commit aborted: branch or batch missing for admissionNumber ${rec.admissionNumber}. Re-preview the file.`,
          );
        }
        const exists = await tx.student.findFirst({
          where: { institutionId: tenant.institutionId, admissionNumber: rec.admissionNumber },
        });
        if (exists) {
          throw validationError(
            `Commit aborted: admissionNumber ${rec.admissionNumber} already exists. Re-preview the file.`,
          );
        }
        const student = await tx.student.create({
          data: {
            institutionId: tenant.institutionId,
            branchId: branch.id,
            admissionNumber: rec.admissionNumber,
            firstName: rec.firstName,
            lastName: rec.lastName,
            email: rec.email || undefined,
            phone: rec.phone || undefined,
          },
        });
        await tx.batchEnrollment.create({ data: { batchId: batch.id, studentId: student.id } });
        if (rec.parentName) {
          const guardian = await tx.guardian.create({
            data: {
              institutionId: tenant.institutionId,
              name: rec.parentName,
              phone: rec.parentPhone || undefined,
              email: rec.parentEmail || undefined,
            },
          });
          await tx.studentGuardian.create({
            data: { studentId: student.id, guardianId: guardian.id, relationship: "GUARDIAN", isPrimary: true },
          });
        }
        count += 1;
      }
      await tx.importJob.update({
        where: { id: job.id },
        data: { status: "COMMITTED", committedAt: new Date() },
      });
      return count;
    });
    await writeAudit(req, "import.commit", "ImportJob", job.id, { created });
    return reply.send({ jobId: job.id, created });
  });

  app.get("/fees", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "fees:read");
    const query = req.query as { studentId?: string };
    if (tenant.role === "PARENT") {
      const ids = await parentStudentIds(tenant);
      if (query.studentId) {
        await assertParentOwnsStudent(tenant, query.studentId);
      }
      return prisma.feeInvoice.findMany({
        where: {
          institutionId: tenant.institutionId,
          studentId: { in: query.studentId ? [query.studentId] : ids },
        },
        take: 100,
        orderBy: { createdAt: "desc" },
      });
    }
    if (query.studentId) await studentInTenant(tenant.institutionId, query.studentId);
    return prisma.feeInvoice.findMany({
      where: {
        institutionId: tenant.institutionId,
        ...(query.studentId ? { studentId: query.studentId } : {}),
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  });
}
