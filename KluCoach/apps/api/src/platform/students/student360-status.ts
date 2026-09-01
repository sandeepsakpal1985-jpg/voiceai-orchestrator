export const STUDENT_360_THRESHOLDS = {
  attendanceHealthy: 85,
  attendanceLow: 75,
  academicHealthy: 75,
  academicLow: 60,
  minAttendanceForTrend: 6,
  minResultsForTrend: 4,
  overdueAttention: 2,
  trendStableBand: 5,
} as const;

export type Student360Status = "DOING_WELL" | "ON_TRACK" | "NEEDS_ATTENTION" | "INSUFFICIENT_DATA";
export type Student360Trend = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";

const LABELS: Record<Student360Status, string> = {
  DOING_WELL: "Doing Well",
  ON_TRACK: "On Track",
  NEEDS_ATTENTION: "Needs Attention",
  INSUFFICIENT_DATA: "Not enough data",
};

export function trendFromRates(older: number | null, newer: number | null, minPoints: number, olderCount: number, newerCount: number): Student360Trend {
  if (olderCount + newerCount < minPoints || older == null || newer == null) return "INSUFFICIENT_DATA";
  const delta = newer - older;
  if (Math.abs(delta) < STUDENT_360_THRESHOLDS.trendStableBand) return "STABLE";
  return delta > 0 ? "IMPROVING" : "DECLINING";
}

export function decideStudent360Status(input: {
  attendanceCount: number;
  attendancePercent: number | null;
  resultCount: number;
  academicAverage: number | null;
  overdue: number;
  academicTrend: Student360Trend;
}): { status: Student360Status; statusLabel: string; reasons: string[] } {
  const reasons: string[] = [];
  if (input.attendanceCount === 0 && input.resultCount === 0) {
    return { status: "INSUFFICIENT_DATA", statusLabel: LABELS.INSUFFICIENT_DATA, reasons: ["No attendance or assessment records yet."] };
  }
  const attendanceLow = input.attendancePercent != null && input.attendancePercent < STUDENT_360_THRESHOLDS.attendanceLow;
  const academicLow = input.academicAverage != null && input.academicAverage < STUDENT_360_THRESHOLDS.academicLow;
  const overdueHeavy = input.overdue >= STUDENT_360_THRESHOLDS.overdueAttention;
  const declining = input.academicTrend === "DECLINING";
  if (attendanceLow) reasons.push("Attendance is below 75%.");
  if (academicLow) reasons.push("Recent assessment average is below 60%.");
  if (overdueHeavy) reasons.push("Two or more assignments are overdue.");
  if (declining) reasons.push("Recent assessment average is declining.");
  if (attendanceLow || academicLow || overdueHeavy || declining) {
    return { status: "NEEDS_ATTENTION", statusLabel: LABELS.NEEDS_ATTENTION, reasons };
  }
  const attendanceHealthy = input.attendancePercent != null && input.attendancePercent >= STUDENT_360_THRESHOLDS.attendanceHealthy;
  const academicHealthy = input.academicAverage != null && input.academicAverage >= STUDENT_360_THRESHOLDS.academicHealthy;
  if (attendanceHealthy && academicHealthy && input.overdue === 0 && input.academicTrend !== "DECLINING") {
    reasons.push("Attendance and recent assessments are healthy.");
    return { status: "DOING_WELL", statusLabel: LABELS.DOING_WELL, reasons };
  }
  reasons.push("Some signals are healthy; others are still forming or mixed.");
  return { status: "ON_TRACK", statusLabel: LABELS.ON_TRACK, reasons };
}
