import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { AttendanceBreakdown } from "../klucoach/AttendanceBreakdown";
import { ParentChildSwitcher } from "../klucoach/ParentChildSwitcher";
import { StudentStatusCard } from "../klucoach/StudentStatusCard";

type Snapshot = {
  children: { id: string; firstName: string; lastName: string }[];
  snapshot: {
    overall: string;
    student: { firstName: string; lastName: string };
    attendance: { percent: number | null; present: number; absent: number; late: number };
    academic: { average: number | null; latest: { percentage: string; assessment: { name: string; subject: { name: string } } }[] };
    assignments: { pending: number };
    nextTest: { name: string; date: string; subject: { name: string } } | null;
    notices: { id: string; title: string }[];
    fees: { pending: number; status: string } | null;
  } | null;
};

export function ParentDashboard() {
  const [params] = useSearchParams();
  const [data, setData] = useState<Snapshot | null>(null);
  const [studentId, setStudentId] = useState<string | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    const requested = studentId ?? params.get("studentId") ?? undefined;
    const q = requested ? `?studentId=${requested}` : "";
    setError("");
    api<Snapshot>(`/dashboard/parent${q}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load snapshot"));
  }, [studentId, params]);

  if (error) return <p className="err">{error}</p>;
  if (!data?.snapshot) return <p>Loading your child’s snapshot…</p>;
  const s = data.snapshot;

  return (
    <div>
      <div className="top">
        <div>
          <h1>
            {s.student.firstName} {s.student.lastName}
          </h1>
          <p className="hint">Everything important, in one glance.</p>
        </div>
        <div className={s.overall === "Doing Well" ? "status" : "status warn"}>{s.overall}</div>
      </div>
      <ParentChildSwitcher
        childList={data.children}
        selectedId={studentId ?? data.children[0]?.id}
        onSelect={setStudentId}
      />
      <div className="kpis">
        <StudentStatusCard
          label="Attendance"
          value={`${s.attendance.percent ?? "—"}%`}
          hint={`Present ${s.attendance.present} · Absent ${s.attendance.absent} · Late ${s.attendance.late}`}
        />
        <StudentStatusCard label="Academic" value={`${s.academic.average ?? "—"}%`} />
        <StudentStatusCard label="Assignments" value={String(s.assignments.pending)} hint="pending" />
        <StudentStatusCard
          label="Upcoming"
          value={s.nextTest ? `${s.nextTest.subject.name} test` : "No test scheduled"}
          compact
        />
      </div>
      <AttendanceBreakdown present={s.attendance.present} absent={s.attendance.absent} late={s.attendance.late} />
      <div className="grid" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="label">Latest marks</div>
          {s.academic.latest.map((r, i) => (
            <div className="row" key={i}>
              <span>
                {r.assessment.subject.name} · {r.assessment.name}
              </span>
              <strong>{Number(r.percentage)}%</strong>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="label">Notices</div>
          {s.notices.map((n) => (
            <div className="row" key={n.id}>
              {n.title}
            </div>
          ))}
          {s.fees && (
            <p className="hint">
              Fees {s.fees.status}: ₹{(s.fees.pending / 100).toLocaleString("en-IN")} pending
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
