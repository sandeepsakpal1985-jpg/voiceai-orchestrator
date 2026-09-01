import { useEffect, useState } from "react";
import { api } from "../api";

export function StudentDashboard() {
  const [data, setData] = useState<{
    student: { firstName: string };
    attendance: { percent: number | null };
    academic: { average: number | null; latest: { percentage: string; assessment: { name: string } }[] };
    assignments: { pending: number };
    notices: { id: string; title: string }[];
  } | null>(null);

  useEffect(() => {
    api<{
      student: { firstName: string };
      attendance: { percent: number | null };
      academic: { average: number | null; latest: { percentage: string; assessment: { name: string } }[] };
      assignments: { pending: number };
      notices: { id: string; title: string }[];
    }>("/dashboard/student")
      .then(setData)
      .catch(() => undefined);
  }, []);

  if (!data) return <p>Loading…</p>;

  return (
    <div>
      <div className="top">
        <h1>Hi, {data.student.firstName}</h1>
      </div>
      <div className="kpis">
        <div className="card">
          <div className="label">Attendance</div>
          <div className="value">{data.attendance.percent ?? "—"}%</div>
        </div>
        <div className="card">
          <div className="label">Average</div>
          <div className="value">{data.academic.average ?? "—"}%</div>
        </div>
        <div className="card">
          <div className="label">Assignments due</div>
          <div className="value">{data.assignments.pending}</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="label">Recent tests</div>
        {data.academic.latest.map((r, i) => (
          <div className="row" key={i}>
            <span>{r.assessment.name}</span>
            <strong>{Number(r.percentage)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
