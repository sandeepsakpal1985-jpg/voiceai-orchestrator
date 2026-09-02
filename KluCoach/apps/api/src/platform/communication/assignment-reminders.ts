/**
 * Assignment due-soon / overdue reminders.
 *
 * NOT IMPLEMENTED as a running scheduler. Call this from a production job runner
 * once one exists. Until then it records the contract only and does not send.
 */
export async function runAssignmentReminders(_now = new Date()) {
  return { scheduled: false as const, scanned: 0, delivered: 0 };
}
