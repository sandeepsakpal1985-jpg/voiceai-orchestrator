import { useEffect, useState } from "react";
import { api } from "../api";

export function AdminDashboard() {
  const [kpis, setKpis] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    api<{ kpis: Record<string, number> }>("/dashboard/admin")
      .then((d) => setKpis(d.kpis))
      .catch(() => undefined);
  }, []);
  if (!kpis) return <p>Loading…</p>;
  const items: [string, string][] = [
    ["totalStudents", "Students"],
    ["activeStudents", "Active"],
    ["attendanceToday", "Attendance today"],
    ["pendingAssessments", "Draft tests"],
    ["upcomingClasses", "Upcoming classes"],
    ["parentActivation", "Parents activated"],
  ];
  return (
    <div>
      <div className="top">
        <h1>Institute snapshot</h1>
      </div>
      <div className="kpis">
        {items.map(([key, label]) => (
          <div className="card" key={key}>
            <div className="label">{label}</div>
            <div className="value">{kpis[key] ?? 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
