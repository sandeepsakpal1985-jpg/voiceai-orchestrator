import type { Student360 } from "@klunex-edu/shared";
import { StudentStatusCard } from "../klucoach/StudentStatusCard";
import { AcademicSummary, RecentResults } from "./AcademicSummary";
import { AssignmentSummary } from "./AssignmentSummary";
import { AttendanceCard } from "./AttendanceCard";
import { FeeStatus, NoticeSummary } from "./NoticeAndFees";
import { StudentSummary } from "./StudentSummary";
import { UpcomingClasses } from "./UpcomingClasses";

export function Student360View({ snapshot, embedded = false }: { snapshot: Student360; embedded?: boolean }) {
  return (
    <div className="student360" data-testid="student-360">
      <StudentSummary snapshot={snapshot} headingLevel={embedded ? "h2" : "h1"} />
      <div className="kpis">
        <StudentStatusCard
          label="Attendance"
          value={snapshot.attendance.percent == null ? "—" : `${snapshot.attendance.percent}%`}
          hint={snapshot.attendance.percent == null ? "Unavailable" : undefined}
        />
        <StudentStatusCard
          label="Academic"
          value={snapshot.academic.average == null ? "—" : `${snapshot.academic.average}%`}
          hint={snapshot.academic.average == null ? "No assessments yet" : undefined}
        />
        <StudentStatusCard label="Assignments" value={String(snapshot.assignments.pending)} hint="pending" />
      </div>
      <div className="student360-stack">
        <AttendanceCard attendance={snapshot.attendance} />
        <UpcomingClasses upcoming={snapshot.upcoming} />
        <AcademicSummary academic={snapshot.academic} />
        <RecentResults academic={snapshot.academic} />
        <AssignmentSummary assignments={snapshot.assignments} />
        <NoticeSummary notices={snapshot.notices} />
        <FeeStatus fees={snapshot.fees} />
      </div>
    </div>
  );
}

export function Student360Loading() {
  return (
    <div className="student360-loading" aria-busy="true" aria-live="polite">
      <p className="hint">Loading Student 360…</p>
      <div className="kpis">
        <div className="card skeleton" />
        <div className="card skeleton" />
        <div className="card skeleton" />
      </div>
    </div>
  );
}
