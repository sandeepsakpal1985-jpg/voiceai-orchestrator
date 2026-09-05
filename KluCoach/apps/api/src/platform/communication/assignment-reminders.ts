/**
 * Assignment due-soon reminders remain unscheduled.
 * Overdue *insights* are produced by `runStudentInsights` (Phase 8) using the same
 * submission statuses as Student 360 (not SUBMITTED/REVIEWED and dueAt < now).
 */
export async function runAssignmentReminders(_now = new Date()) {
  return { scheduled: false as const, scanned: 0, delivered: 0 };
}
