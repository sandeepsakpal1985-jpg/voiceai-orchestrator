import { PrismaClient, type Prisma } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "DemoPassw0rd!";

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  await prisma.auditLog.deleteMany();
  await prisma.importRowError.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.noticeStudent.deleteMany();
  await prisma.notice.deleteMany();
  await prisma.assignmentSubmission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.assessmentResult.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.classSession.deleteMany();
  await prisma.timetableSlot.deleteMany();
  await prisma.batchEnrollment.deleteMany();
  await prisma.batchSubject.deleteMany();
  await prisma.teacherBatch.deleteMany();
  await prisma.teacherBranch.deleteMany();
  await prisma.teacherSubject.deleteMany();
  await prisma.studentGuardian.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.studentEntitlement.deleteMany();
  await prisma.billingRefund.deleteMany();
  await prisma.billingPayment.deleteMany();
  await prisma.billingInvoiceLine.deleteMany();
  await prisma.billingInvoice.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.feeRefund.deleteMany();
  await prisma.feeDiscount.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.feeInvoice.deleteMany();
  await prisma.feePlan.deleteMany();
  await prisma.session.deleteMany();
  await prisma.fileObject.deleteMany();
  await prisma.student.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.program.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenantSubscription.deleteMany();
  await prisma.user.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.platformBillingConfig.deleteMany();
  await prisma.subscriptionPlan.deleteMany();

  await prisma.platformBillingConfig.create({
    data: { id: "platform", currency: "INR", billingPeriod: "ANNUAL", gracePeriodDays: 7, billableStudentStatuses: ["ACTIVE"] },
  });

  const direct = await prisma.subscriptionPlan.create({
    data: {
      code: "DIRECT",
      name: "Direct",
      description: "Direct / public list reference. Amounts are configuration, not code.",
      product: "KLUCOACH",
      billingPeriod: "ANNUAL",
      currency: "INR",
      commercialMode: "DIRECT",
      listPricePaise: 199900,
      amountPaisePerStudentYear: 199900,
      klunexSharePaise: 199900,
      partnerSharePaise: 0,
    },
  });
  const partner = await prisma.subscriptionPlan.create({
    data: {
      code: "PARTNER",
      name: "Partner",
      description: "Institution partner plan (demo configuration).",
      product: "KLUCOACH",
      billingPeriod: "ANNUAL",
      currency: "INR",
      commercialMode: "PARTNER",
      listPricePaise: 199900,
      amountPaisePerStudentYear: 99900,
      klunexSharePaise: 50000,
      partnerSharePaise: 49900,
    },
  });
  await prisma.subscriptionPlan.create({
    data: {
      code: "PREMIUM",
      name: "Premium",
      description: "Premium direct plan.",
      product: "KLUCOACH",
      billingPeriod: "ANNUAL",
      currency: "INR",
      commercialMode: "DIRECT",
      listPricePaise: 299900,
      amountPaisePerStudentYear: 299900,
      klunexSharePaise: 299900,
      partnerSharePaise: 0,
    },
  });

  await prisma.user.create({
    data: {
      email: "superadmin@example.test",
      passwordHash,
      firstName: "KluNex",
      lastName: "Operator",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  const demo = await seedTenant({
    name: "Demo Coaching Institute",
    city: "Mumbai",
    state: "Maharashtra",
    passwordHash,
    plan: partner,
    billingMode: "NON_BILLABLE",
    primary: true,
  });

  await seedTenant({
    name: "Other Academy",
    city: "Pune",
    state: "Maharashtra",
    passwordHash,
    plan: direct,
    billingMode: "NON_BILLABLE",
    primary: false,
  });

  console.log("Seed complete.");
  console.log("Demo tenant:", demo.institutionId);
  console.log("Password for all demo users:", DEMO_PASSWORD);
}

async function seedTenant(opts: {
  name: string;
  city: string;
  state: string;
  passwordHash: string;
  plan: {
    id: string;
    currency: string;
    commercialMode: string;
    amountPaisePerStudentYear: number;
    klunexSharePaise: number;
    partnerSharePaise: number;
    name: string;
  };
  billingMode: string;
  primary: boolean;
}) {
  const institution = await prisma.institution.create({
    data: {
      name: opts.name,
      legalName: `${opts.name} Pvt Ltd`,
      displayName: opts.name,
      slug: slugify(opts.name),
      type: "COACHING",
      city: opts.city,
      state: opts.state,
      country: "IN",
      email: opts.primary ? "hello@demo.example.test" : "hello@other.example.test",
      phone: opts.primary ? "+910000000001" : "+910000000002",
      status: "ACTIVE",
      billingMode: opts.billingMode,
    },
  });

  const startsAt = date("2026-04-01");
  const endsAt = date("2027-03-31");
  const subscription = await prisma.tenantSubscription.create({
    data: {
      institutionId: institution.id,
      planId: opts.plan.id,
      startsAt,
      endsAt,
      renewalDate: date("2027-04-01"),
      status: "ACTIVE",
      currency: opts.plan.currency,
      commercialMode: opts.plan.commercialMode,
      studentUnitPricePaise: opts.plan.amountPaisePerStudentYear,
      klunexUnitRealizationPaise: opts.plan.klunexSharePaise,
      partnerUnitSharePaise: opts.plan.partnerSharePaise,
      gracePeriodDays: 7,
    },
  });

  const year = await prisma.academicYear.create({
    data: {
      institutionId: institution.id,
      name: "2026-27",
      startDate: date("2026-04-01"),
      endDate: date("2027-03-31"),
      isCurrent: true,
    },
  });

  const mumbai = await prisma.branch.create({
    data: {
      institutionId: institution.id,
      name: opts.primary ? "Mumbai Central" : "Pune Camp",
      city: opts.city,
      state: opts.state,
    },
  });
  const second = await prisma.branch.create({
    data: {
      institutionId: institution.id,
      name: opts.primary ? "Dombivli" : "Pune Kothrud",
      city: opts.primary ? "Dombivli" : "Pune",
      state: opts.state,
    },
  });

  const programs = await prisma.program.createManyAndReturn({
    data: [
      { institutionId: institution.id, name: "JEE", code: "JEE" },
      { institutionId: institution.id, name: "NEET", code: "NEET" },
      { institutionId: institution.id, name: "CBSE 10", code: "CBSE10" },
    ],
  });

  const subjects = await prisma.subject.createManyAndReturn({
    data: ["Mathematics", "Physics", "Chemistry", "Biology", "English"].map((name, i) => ({
      institutionId: institution.id,
      name,
      code: ["MATH", "PHY", "CHEM", "BIO", "ENG"][i],
    })),
  });

  const subject = (name: string) => subjects.find((s) => s.name === name)!;
  const program = (name: string) => programs.find((p) => p.name === name)!;

  const jee = await prisma.batch.create({
    data: {
      institutionId: institution.id,
      branchId: mumbai.id,
      academicYearId: year.id,
      programId: program("JEE").id,
      name: "JEE 2027 Morning Batch",
      startDate: date("2026-04-15"),
      endDate: date("2027-03-31"),
      capacity: 40,
      rankingEnabled: false,
    },
  });
  const neet = await prisma.batch.create({
    data: {
      institutionId: institution.id,
      branchId: mumbai.id,
      academicYearId: year.id,
      programId: program("NEET").id,
      name: "NEET 2027 Evening Batch",
      startDate: date("2026-04-15"),
      endDate: date("2027-03-31"),
      capacity: 40,
    },
  });
  const cbse = await prisma.batch.create({
    data: {
      institutionId: institution.id,
      branchId: second.id,
      academicYearId: year.id,
      programId: program("CBSE 10").id,
      name: "10th CBSE Maths Batch",
      startDate: date("2026-06-01"),
      endDate: date("2027-03-31"),
      capacity: 30,
    },
  });

  await prisma.batchSubject.createMany({
    data: [
      { batchId: jee.id, subjectId: subject("Mathematics").id },
      { batchId: jee.id, subjectId: subject("Physics").id },
      { batchId: jee.id, subjectId: subject("Chemistry").id },
      { batchId: neet.id, subjectId: subject("Physics").id },
      { batchId: neet.id, subjectId: subject("Chemistry").id },
      { batchId: neet.id, subjectId: subject("Biology").id },
      { batchId: cbse.id, subjectId: subject("Mathematics").id },
      { batchId: cbse.id, subjectId: subject("English").id },
    ],
  });

  const adminEmail = opts.primary ? "admin@example.test" : "admin-b@example.test";
  const teacherEmail = opts.primary ? "teacher@example.test" : "teacher-b@example.test";
  const parentEmail = opts.primary ? "parent@example.test" : "parent-b@example.test";
  const studentEmail = opts.primary ? "student@example.test" : "student-b@example.test";

  const adminUser = await prisma.user.create({
    data: {
      institutionId: institution.id,
      email: adminEmail,
      passwordHash: opts.passwordHash,
      firstName: "Anita",
      lastName: "Desai",
      role: "INSTITUTION_ADMIN",
    },
  });

  const teacherUser = await prisma.user.create({
    data: {
      institutionId: institution.id,
      email: teacherEmail,
      passwordHash: opts.passwordHash,
      firstName: "Rahul",
      lastName: "Iyer",
      role: "TEACHER",
    },
  });

  const teacher = await prisma.teacher.create({
    data: {
      institutionId: institution.id,
      userId: teacherUser.id,
      employeeId: opts.primary ? "T-1001" : "T-2001",
      name: "Rahul Iyer",
      email: teacherEmail,
      branches: { create: [{ branchId: mumbai.id }, { branchId: second.id }] },
      batches: { create: [{ batchId: jee.id }, { batchId: neet.id }, { batchId: cbse.id }] },
      subjects: {
        create: [
          { subjectId: subject("Physics").id },
          { subjectId: subject("Mathematics").id },
        ],
      },
    },
  });

  const firstNames = [
    "Aarav", "Diya", "Ishaan", "Meera", "Kabir", "Ananya", "Vivaan", "Sara",
    "Advait", "Kiara", "Reyansh", "Aisha", "Arjun", "Nina", "Dev", "Zara",
    "Om", "Myra", "Harsh", "Leela", "Yash", "Pia",
  ];

  const students = [];
  for (let i = 0; i < (opts.primary ? 22 : 4); i++) {
    const firstName = firstNames[i] ?? `Student${i}`;
    const batch = i % 3 === 0 ? jee : i % 3 === 1 ? neet : cbse;
    const branchId = batch.id === cbse.id ? second.id : mumbai.id;
    const isAarav = opts.primary && i === 0;

    const studentUser = isAarav || (!opts.primary && i === 0)
      ? await prisma.user.create({
          data: {
            institutionId: institution.id,
            email: studentEmail,
            passwordHash: opts.passwordHash,
            firstName,
            lastName: "Sharma",
            role: "STUDENT",
          },
        })
      : null;

    const student = await prisma.student.create({
      data: {
        institutionId: institution.id,
        branchId,
        userId: studentUser?.id,
        academicYearId: year.id,
        admissionNumber: `${opts.primary ? "D" : "O"}-${1001 + i}`,
        studentCode: `${opts.primary ? "DC" : "OA"}-${1001 + i}`,
        firstName,
        lastName: "Sharma",
        preferredName: firstName,
        dateOfBirth: date(`2010-0${(i % 8) + 1}-15`),
        gender: i % 2 === 0 ? "MALE" : "FEMALE",
        email: isAarav ? studentEmail : undefined,
        status: "ACTIVE",
        admissionDate: date("2026-04-10"),
      },
    });
    await prisma.batchEnrollment.create({
      data: { batchId: batch.id, studentId: student.id },
    });
    students.push({ student, batch });
  }

  const primaryStudent = students[0]!.student;
  const parentUser = await prisma.user.create({
    data: {
      institutionId: institution.id,
      email: parentEmail,
      passwordHash: opts.passwordHash,
      firstName: "Priya",
      lastName: "Sharma",
      role: "PARENT",
    },
  });
  const guardian = await prisma.guardian.create({
    data: {
      institutionId: institution.id,
      userId: parentUser.id,
      name: "Priya Sharma",
      email: parentEmail,
      phone: opts.primary ? "+910000001111" : "+910000002222",
    },
  });
  await prisma.studentGuardian.create({
    data: {
      studentId: primaryStudent.id,
      guardianId: guardian.id,
      relationship: "MOTHER",
      isPrimary: true,
    },
  });

  if (opts.primary) {
    const secondChild = students[1]!.student;
    await prisma.studentGuardian.create({
      data: {
        studentId: secondChild.id,
        guardianId: guardian.id,
        relationship: "MOTHER",
        isPrimary: true,
      },
    });
  }

  for (const { student } of students.slice(opts.primary ? 2 : 1)) {
    const g = await prisma.guardian.create({
      data: {
        institutionId: institution.id,
        name: `${student.firstName} Parent`,
        phone: `+91000001${student.admissionNumber.replace(/\D/g, "").slice(-4)}`,
        email: `${student.firstName.toLowerCase()}.parent@example.test`,
      },
    });
    await prisma.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: g.id,
        relationship: "FATHER",
        isPrimary: true,
      },
    });
  }

  const slots: Prisma.TimetableSlotCreateManyInput[] = [
    { institutionId: institution.id, batchId: jee.id, subjectId: subject("Physics").id, teacherId: teacher.id, dayOfWeek: "MONDAY", startMinute: 17 * 60, endMinute: 18 * 60, room: "R1" },
    { institutionId: institution.id, batchId: jee.id, subjectId: subject("Chemistry").id, teacherId: teacher.id, dayOfWeek: "MONDAY", startMinute: 18 * 60, endMinute: 19 * 60, room: "R1" },
    { institutionId: institution.id, batchId: jee.id, subjectId: subject("Mathematics").id, teacherId: teacher.id, dayOfWeek: "TUESDAY", startMinute: 17 * 60, endMinute: 18 * 60, room: "R2" },
    { institutionId: institution.id, batchId: neet.id, subjectId: subject("Biology").id, teacherId: teacher.id, dayOfWeek: "WEDNESDAY", startMinute: 18 * 60, endMinute: 19 * 60, room: "R3" },
    { institutionId: institution.id, batchId: cbse.id, subjectId: subject("Mathematics").id, teacherId: teacher.id, dayOfWeek: "THURSDAY", startMinute: 16 * 60, endMinute: 17 * 60, room: "R4" },
  ];
  await prisma.timetableSlot.createMany({ data: slots });

  const sessionDate = date("2026-08-24");
  const physicsSession = await prisma.classSession.create({
    data: {
      institutionId: institution.id,
      batchId: jee.id,
      subjectId: subject("Physics").id,
      teacherId: teacher.id,
      date: sessionDate,
      startMinute: 17 * 60,
      endMinute: 18 * 60,
      room: "R1",
      status: "COMPLETED",
    },
  });

  await prisma.classSession.create({
    data: {
      institutionId: institution.id,
      batchId: jee.id,
      subjectId: subject("Physics").id,
      teacherId: teacher.id,
      date: date("2026-10-05"),
      startMinute: 17 * 60,
      endMinute: 18 * 60,
      room: "R1",
      status: "SCHEDULED",
    },
  });
  await prisma.classSession.create({
    data: {
      institutionId: institution.id,
      batchId: neet.id,
      subjectId: subject("Biology").id,
      teacherId: teacher.id,
      date: date("2026-10-06"),
      startMinute: 18 * 60,
      endMinute: 19 * 60,
      room: "R3",
      status: "SCHEDULED",
    },
  });

  const jeeStudents = students.filter((s) => s.batch.id === jee.id);
  await prisma.attendanceRecord.createMany({
    data: jeeStudents.map(({ student }, idx) => ({
      institutionId: institution.id,
      studentId: student.id,
      batchId: jee.id,
      classSessionId: physicsSession.id,
      date: sessionDate,
      status: idx === 1 ? "ABSENT" : idx === 2 ? "LATE" : "PRESENT",
      markedById: teacherUser.id,
    })),
  });

  const assessment = await prisma.assessment.create({
    data: {
      institutionId: institution.id,
      batchId: jee.id,
      subjectId: subject("Physics").id,
      createdById: teacherUser.id,
      name: "Physics Unit Test 1",
      type: "TEST",
      date: date("2026-08-20"),
      maxMarks: 100,
      passingMarks: 35,
      status: "PUBLISHED",
    },
  });

  await prisma.assessmentResult.createMany({
    data: jeeStudents.map(({ student }, idx) => {
      const marks = 82 - idx * 4;
      return {
        institutionId: institution.id,
        assessmentId: assessment.id,
        studentId: student.id,
        marks,
        percentage: marks,
        grade: marks >= 75 ? "A" : "B",
      };
    }),
  });

  const assignment = await prisma.assignment.create({
    data: {
      institutionId: institution.id,
      batchId: jee.id,
      subjectId: subject("Physics").id,
      createdById: teacherUser.id,
      title: "Motion numericals worksheet",
      description: "Complete questions 1–12.",
      dueAt: date("2026-09-05"),
    },
  });
  await prisma.assignmentSubmission.createMany({
    data: jeeStudents.map(({ student }, idx) => ({
      assignmentId: assignment.id,
      studentId: student.id,
      status: idx === 0 ? "SUBMITTED" : "PENDING",
      submittedAt: idx === 0 ? new Date() : null,
    })),
  });

  await prisma.notice.create({
    data: {
      institutionId: institution.id,
      createdById: adminUser.id,
      title: "Independence Day holiday",
      body: "Institute closed on 15 August. Regular batches resume the next working day.",
      audience: "INSTITUTION",
    },
  });
  await prisma.notice.create({
    data: {
      institutionId: institution.id,
      batchId: jee.id,
      createdById: teacherUser.id,
      title: "Physics test this Friday",
      body: "Unit test covering kinematics and laws of motion. Max marks 100.",
      audience: "BATCH",
    },
  });

  const feePlan = await prisma.feePlan.create({
    data: {
      institutionId: institution.id,
      name: "Annual coaching",
      amountPaise: 4800000,
      period: "YEAR",
    },
  });
  await prisma.feeInvoice.create({
    data: {
      institutionId: institution.id,
      studentId: primaryStudent.id,
      feePlanId: feePlan.id,
      totalPaise: 4800000,
      paidPaise: 2400000,
      dueDate: date("2026-09-30"),
      status: "PARTIAL",
    },
  });

  for (const row of students) {
    await prisma.studentEntitlement.create({
      data: {
        institutionId: institution.id,
        studentId: row.student.id,
        subscriptionId: subscription.id,
        startsAt,
        endsAt,
        unitPricePaise: opts.plan.amountPaisePerStudentYear,
        status: "ACTIVE",
      },
    });
  }

  const billable = students.length;
  const unit = opts.plan.amountPaisePerStudentYear;
  const gross = billable * unit;
  const issued = await prisma.billingInvoice.create({
    data: {
      institutionId: institution.id,
      subscriptionId: subscription.id,
      invoiceNumber: opts.primary ? "KC-2026-0001" : "KC-2026-B001",
      issueDate: date("2026-04-01"),
      dueDate: date("2026-04-15"),
      currency: opts.plan.currency,
      subtotalPaise: gross,
      totalPaise: gross,
      paidPaise: 0,
      status: "ISSUED",
      dedupeKey: `issue:${subscription.id}:2026-04-01:2027-03-31`,
      lines: {
        create: {
          description: `KluCoach student subscription (${opts.plan.name}) — demo data`,
          studentCount: billable,
          unitPricePaise: unit,
          amountPaise: gross,
          periodStart: date("2026-04-01"),
          periodEnd: date("2027-03-31"),
        },
      },
    },
  });

  const priorGross = unit * Math.min(2, billable);
  const paidInv = await prisma.billingInvoice.create({
    data: {
      institutionId: institution.id,
      subscriptionId: subscription.id,
      invoiceNumber: opts.primary ? "KC-2025-0001" : "KC-2025-B001",
      issueDate: date("2025-04-01"),
      dueDate: date("2025-04-15"),
      currency: opts.plan.currency,
      subtotalPaise: priorGross,
      totalPaise: priorGross,
      paidPaise: priorGross,
      status: "PAID",
      dedupeKey: `issue:${subscription.id}:2025-04-01:2026-03-31`,
      lines: {
        create: {
          description: `KluCoach student subscription (${opts.plan.name}) — prior period demo`,
          studentCount: Math.min(2, billable),
          unitPricePaise: unit,
          amountPaise: priorGross,
          periodStart: date("2025-04-01"),
          periodEnd: date("2026-03-31"),
        },
      },
    },
  });
  await prisma.billingPayment.create({
    data: {
      institutionId: institution.id,
      invoiceId: paidInv.id,
      amountPaise: priorGross,
      currency: opts.plan.currency,
      paymentDate: date("2025-04-10"),
      method: "MANUAL",
      status: "SUCCESS",
      provider: "MANUAL",
      providerReference: "DEMO-MANUAL",
      dedupeKey: `pay:${paidInv.id}:seed`,
    },
  });
  void issued;

  return { institutionId: institution.id };
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
