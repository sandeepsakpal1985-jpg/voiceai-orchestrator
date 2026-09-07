import { prisma } from "@klunex-edu/database";

export type OnboardingItem = {
  id: string;
  label: string;
  done: boolean;
  href: string;
};

export async function assembleOnboarding(institutionId: string) {
  const [
    branches,
    programs,
    batches,
    teachers,
    students,
    guardians,
    activated,
    timetable,
    attendance,
    assessments,
  ] = await Promise.all([
    prisma.branch.count({ where: { institutionId } }),
    prisma.program.count({ where: { institutionId } }),
    prisma.batch.count({ where: { institutionId } }),
    prisma.teacher.count({ where: { institutionId } }),
    prisma.student.count({ where: { institutionId, status: "ACTIVE" } }),
    prisma.guardian.count({ where: { institutionId } }),
    prisma.guardian.count({ where: { institutionId, userId: { not: null } } }),
    prisma.timetableSlot.count({ where: { institutionId } }),
    prisma.attendanceRecord.count({ where: { institutionId } }),
    prisma.assessment.count({ where: { institutionId } }),
  ]);

  const items: OnboardingItem[] = [
    { id: "institution", label: "Institution", done: true, href: "/admin" },
    { id: "branch", label: "Branch", done: branches > 0, href: "/batches" },
    { id: "programs", label: "Programs", done: programs > 0, href: "/batches" },
    { id: "batches", label: "Batches", done: batches > 0, href: "/batches" },
    { id: "teachers", label: "Teachers", done: teachers > 0, href: "/teachers" },
    { id: "students", label: "Students", done: students > 0, href: "/students" },
    { id: "parentLinks", label: "Parents", done: guardians > 0, href: "/parents" },
    { id: "parentActivation", label: "Parent activation", done: activated > 0, href: "/parents" },
    { id: "timetable", label: "Timetable", done: timetable > 0, href: "/timetable" },
    { id: "firstAttendance", label: "First attendance", done: attendance > 0, href: "/attendance" },
    { id: "firstAssessment", label: "First assessment", done: assessments > 0, href: "/assessments" },
  ];

  return {
    items,
    complete: items.filter((item) => item.done).length,
    total: items.length,
  };
}
