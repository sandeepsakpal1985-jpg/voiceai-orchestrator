import type { InsightType, InsightSeverity } from "@klunex-edu/shared";

export type PeriodWindows = {
  previousStart: Date;
  currentStart: Date;
  end: Date;
  periodKey: string;
};

export function utcDay(value: Date) {
  const d = new Date(value);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function isoDate(value: Date) {
  return utcDay(value).toISOString().slice(0, 10);
}

export function addUtcDays(value: Date, days: number) {
  const d = utcDay(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function periodWindows(asOf: Date, periodDays: number): PeriodWindows {
  const end = utcDay(asOf);
  const currentStart = addUtcDays(end, -periodDays);
  const previousStart = addUtcDays(currentStart, -periodDays);
  return { previousStart, currentStart, end, periodKey: isoDate(currentStart) };
}

export function attendancePercent(records: { status: string }[]) {
  if (!records.length) return null;
  const present = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
  return Math.round((present / records.length) * 1000) / 10;
}

export function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((s, n) => s + n, 0) / values.length) * 10) / 10;
}

/** |delta| < threshold is treated as trivial. Equal to the threshold is a change. */
export function classifyChange(
  previous: number,
  current: number,
  threshold: number,
): "decline" | "improvement" | "none" {
  const delta = current - previous;
  if (Math.abs(delta) < threshold) return "none";
  return delta < 0 ? "decline" : "improvement";
}

export function inWindow(date: Date, start: Date, end: Date) {
  const t = utcDay(date).getTime();
  return t >= start.getTime() && t < end.getTime();
}

export type DetectedInsight = {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  summary: string;
  source: Record<string, unknown>;
  dedupeKey: string;
};

export function attendanceInsight(input: {
  previous: number;
  current: number;
  previousCount: number;
  currentCount: number;
  minSamples: number;
  threshold: number;
  periodKey: string;
}): DetectedInsight | null {
  if (input.previousCount < input.minSamples || input.currentCount < input.minSamples) return null;
  const change = classifyChange(input.previous, input.current, input.threshold);
  if (change === "none") return null;
  const type: InsightType = change === "decline" ? "ATTENDANCE_DECLINE" : "ATTENDANCE_IMPROVEMENT";
  const verb = change === "decline" ? "decreased" : "improved";
  const summary = `Attendance ${verb} from ${input.previous}% to ${input.current}%.`;
  return {
    type,
    severity: change === "decline" ? "ATTENTION" : "INFO",
    title: summary,
    summary,
    source: {
      type: "attendance",
      previousPercentage: input.previous,
      currentPercentage: input.current,
      previousCount: input.previousCount,
      currentCount: input.currentCount,
      periodKey: input.periodKey,
    },
    dedupeKey: `${type}:${input.periodKey}`,
  };
}

export function academicInsight(input: {
  previous: number;
  current: number;
  previousCount: number;
  currentCount: number;
  minSamples: number;
  threshold: number;
  periodKey: string;
}): DetectedInsight | null {
  if (input.previousCount < input.minSamples || input.currentCount < input.minSamples) return null;
  const change = classifyChange(input.previous, input.current, input.threshold);
  if (change === "none") return null;
  const type: InsightType = change === "decline" ? "ACADEMIC_DECLINE" : "ACADEMIC_IMPROVEMENT";
  const verb = change === "decline" ? "decreased" : "improved";
  const summary = `Recent assessment average ${verb} from ${input.previous}% to ${input.current}%.`;
  return {
    type,
    severity: change === "decline" ? "ATTENTION" : "INFO",
    title: summary,
    summary,
    source: {
      type: "assessment",
      previousAverage: input.previous,
      currentAverage: input.current,
      previousCount: input.previousCount,
      currentCount: input.currentCount,
      periodKey: input.periodKey,
    },
    dedupeKey: `${type}:${input.periodKey}`,
  };
}

export function assignmentOverdueInsight(input: {
  assignmentId: string;
  title: string;
  subject: string;
  dueDate: string;
}): DetectedInsight {
  const label = input.subject ? `${input.subject} assignment` : "Assignment";
  const summary = `${label} is overdue.`;
  return {
    type: "ASSIGNMENT_OVERDUE",
    severity: "ATTENTION",
    title: summary,
    summary: `${input.title} is overdue.`,
    source: {
      type: "assignment",
      assignmentId: input.assignmentId,
      title: input.title,
      subject: input.subject,
      dueDate: input.dueDate,
    },
    dedupeKey: `ASSIGNMENT_OVERDUE:${input.assignmentId}`,
  };
}

export function containsForbiddenInsightLanguage(text: string) {
  return /at risk|drop ?out|ADHD|depress|intelligence|lazy|gifted|psycholog|struggling|likely to fail|failure probability|behavior score|mental health|personality|socioeconomic|quality score/i.test(
    text,
  );
}
