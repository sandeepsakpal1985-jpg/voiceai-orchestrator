import { useEffect, useState } from "react";
import { api } from "../api";

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
  const [data, setData] = useState<Snapshot | null>(null);
  const [studentId, setStudentId] = useState<string | undefined>();

  useEffect(() => {
    const q = studentId ? `?studentId=${studentId}` : "";
    api<Snapshot>(`/dashboard/parent${q}`).then(setData).catch(() => undefined);
  }, [studentId]);

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
      <div className="child-pills">
        {data.children.map((c) => (
          <button key={c.id} className={c.id === (studentId ?? data.children[0]?.id) ? "pill on" : "pill"} onClick={() => setStudentId(c.id)}>
            {c.firstName}
          </button>
        ))}
      </div>
      <div className="kpis">
        <div className="card">
          <div className="label">Attendance</div>
          <div className="value">{s.attendance.percent ?? "—"}%</div>
          <div className="hint">
            Present {s.attendance.present} · Absent {s.attendance.absent} · Late {s.attendance.late}
          </div>
        </div>
        <div className="card">
          <div className="label">Academic</div>
          <div className="value">{s.academic.average ?? "—"}%</div>
        </div>
        <div className="card">
          <div className="label">Assignments</div>
          <div className="value">{s.assignments.pending}</div>
          <div className="hint">pending</div>
        </div>
        <div className="card">
          <div className="label">Upcoming</div>
          <div className="value" style={{ fontSize: "1.1rem" }}>
            {s.nextTest ? `${s.nextTest.subject.name} test` : "No test scheduled"}
          </div>
        </div>
      </div>
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
