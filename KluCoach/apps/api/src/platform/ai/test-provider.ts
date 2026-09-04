import type { AiGenerateInput, AiGenerateResult, AiProvider } from "./provider.js";

function factsFromContext(contextJson: string): string[] {
  const ctx = JSON.parse(contextJson) as Record<string, unknown>;
  const facts: string[] = [];
  const student = ctx.student as { name?: string } | undefined;
  const attendance = ctx.attendance as { percentage?: number | null; recentAbsences?: number } | undefined;
  const academics = ctx.academics as { averagePercentage?: number | null; strongestSubject?: string | null } | undefined;
  const assignments = ctx.assignments as { pending?: number } | undefined;
  const fees = ctx.fees as { label?: string | null } | undefined;
  const batch = ctx.batch as { name?: string; studentCount?: number; lowAttendanceCount?: number } | undefined;
  const institution = ctx.institution as { activeStudents?: number; batchCount?: number } | undefined;
  const batches = ctx.batches as { name: string; attendancePercent?: number | null }[] | undefined;
  if (student?.name) facts.push(`student ${student.name}`);
  if (attendance && attendance.percentage != null) facts.push(`attendance ${attendance.percentage}%`);
  if (attendance?.recentAbsences != null) facts.push(`${attendance.recentAbsences} recent absences`);
  if (academics && academics.averagePercentage != null) facts.push(`recent average ${academics.averagePercentage}%`);
  if (academics?.strongestSubject) facts.push(`strongest recorded subject ${academics.strongestSubject}`);
  if (assignments?.pending != null) facts.push(`${assignments.pending} pending assignments`);
  if (fees?.label) facts.push(`fee status ${fees.label}`);
  if (batch?.name) facts.push(`batch ${batch.name}`);
  if (batch?.studentCount != null) facts.push(`${batch.studentCount} authorized students`);
  if (batch?.lowAttendanceCount != null) facts.push(`${batch.lowAttendanceCount} with attendance below 75%`);
  if (institution?.activeStudents != null) facts.push(`${institution.activeStudents} active students`);
  if (institution?.batchCount != null) facts.push(`${institution.batchCount} batches`);
  if (batches?.length) {
    facts.push(`batches ${batches.map((b) => b.name).join(", ")}`);
  }
  return facts;
}

export class TestAiProvider implements AiProvider {
  readonly name = "test";

  async generateResponse(input: AiGenerateInput): Promise<AiGenerateResult> {
    const facts = factsFromContext(input.contextJson);
    const injection = /ignore (your|all|the) instructions|show me another student|dump the database/i.test(
      input.userMessage,
    );
    const body = facts.length ? facts.join(". ") : "no recorded facts in the supplied KluCoach context";
    const prefix = injection
      ? "I can only use the supplied KluCoach data. "
      : "Based on KluCoach data: ";
    return { text: `${prefix}${body}.`, model: "test-ai-v1" };
  }
}
