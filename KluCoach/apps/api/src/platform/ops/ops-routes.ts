import type { FastifyInstance } from "fastify";
import { prisma } from "@klunex-edu/database";
import { notFound, validationError } from "../../lib/errors.js";
import { requirePermission, requireTenant } from "../identity/http-auth.js";
import { writeAudit } from "../audit/write.js";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\n") {
      row.push(cur.trim());
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") cur += ch;
  }
  if (cur.length || row.length) {
    row.push(cur.trim());
    if (row.some((c) => c.length)) rows.push(row);
  }
  return rows;
}

const REQUIRED = ["firstName", "lastName", "admissionNumber", "branchName", "batchName"];

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

  app.post("/imports/students/preview", async (req, reply) => {
    const tenant = requireTenant(req);
    requirePermission(req, "import:write");
    const file = await req.file();
    if (!file) throw validationError("CSV file required");
    const buf = await file.toBuffer();
    const text = buf.toString("utf8");
    if (text.startsWith("PK")) throw validationError("Excel .xlsx is not parsed in MVP. Export CSV and upload again.");
    const table = parseCsv(text);
    if (table.length < 2) throw validationError("CSV has no data rows");
    const headers = table[0]!.map((h) => h.replace(/^\uFEFF/, ""));
    const missing = REQUIRED.filter((h) => !headers.includes(h));
    if (missing.length) throw validationError(`Missing columns: ${missing.join(", ")}`);
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
    const col = (row: string[], name: string) => row[idx[name] ?? -1] ?? "";
    const errors: { rowNumber: number; message: string }[] = [];
    const valid: Record<string, string>[] = [];
    table.slice(1).forEach((row, i) => {
      const rowNumber = i + 2;
      const rec: Record<string, string> = {};
      for (const h of headers) rec[h] = col(row, h);
      if (!rec.firstName || !rec.lastName) errors.push({ rowNumber, message: "firstName and lastName required" });
      else if (!rec.admissionNumber) errors.push({ rowNumber, message: "admissionNumber required" });
      else if (!rec.branchName) errors.push({ rowNumber, message: "branchName required" });
      else if (!rec.batchName) errors.push({ rowNumber, message: "batchName required" });
      else valid.push(rec);
    });
    const job = await prisma.importJob.create({
      data: {
        institutionId: tenant.institutionId,
        createdById: tenant.id,
        status: "VALIDATED",
        fileName: file.filename,
        totalRows: table.length - 1,
        validRows: valid.length,
        errorRows: errors.length,
        payload: valid,
        errors: { create: errors },
      },
      include: { errors: true },
    });
    return reply.code(200).send({
      jobId: job.id,
      total: job.totalRows,
      valid: job.validRows,
      errors: job.errors,
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
    const rows = job.payload as Record<string, string>[];
    let created = 0;
    for (const rec of rows) {
      const branch = await prisma.branch.findFirst({
        where: { institutionId: tenant.institutionId, name: rec.branchName },
      });
      const batch = await prisma.batch.findFirst({
        where: { institutionId: tenant.institutionId, name: rec.batchName },
      });
      if (!branch || !batch) continue;
      const exists = await prisma.student.findFirst({
        where: { institutionId: tenant.institutionId, admissionNumber: rec.admissionNumber },
      });
      if (exists) continue;
      const student = await prisma.student.create({
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
      await prisma.batchEnrollment.create({ data: { batchId: batch.id, studentId: student.id } });
      if (rec.parentName) {
        const guardian = await prisma.guardian.create({
          data: {
            institutionId: tenant.institutionId,
            name: rec.parentName,
            phone: rec.parentPhone || undefined,
            email: rec.parentEmail || undefined,
          },
        });
        await prisma.studentGuardian.create({
          data: { studentId: student.id, guardianId: guardian.id, relationship: "GUARDIAN", isPrimary: true },
        });
      }
      created += 1;
    }
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "COMMITTED", committedAt: new Date() },
    });
    await writeAudit(req, "import.commit", "ImportJob", job.id, { created });
    return reply.send({ jobId: job.id, created });
  });

  app.get("/fees", async (req) => {
    const tenant = requireTenant(req);
    requirePermission(req, "fees:read");
    const query = req.query as { studentId?: string };
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
