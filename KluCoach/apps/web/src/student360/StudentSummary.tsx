import type { Student360 } from "@klunex-edu/shared";

const STATUS_CLASS: Record<string, string> = {
  DOING_WELL: "status",
  ON_TRACK: "status",
  NEEDS_ATTENTION: "status warn",
  INSUFFICIENT_DATA: "status muted",
};

export function StudentSummary({ snapshot, headingLevel = "h1" }: { snapshot: Student360; headingLevel?: "h1" | "h2" }) {
  const Title = headingLevel;
  const s = snapshot.student;
  return (
    <div className="top student360-header">
      <div>
        <Title>
          {s.firstName} {s.lastName}
        </Title>
        <p className="hint">
          {[s.batch, s.program, s.branch, s.academicYear].filter(Boolean).join(" · ")}
        </p>
        <p className="hint" id="student360-status-reason">
          {snapshot.summary.reasons[0]}
        </p>
      </div>
      <div
        className={STATUS_CLASS[snapshot.summary.status] ?? "status"}
        role="status"
        data-testid="student360-status"
        aria-describedby="student360-status-reason"
      >
        {snapshot.summary.statusLabel}
      </div>
    </div>
  );
}
