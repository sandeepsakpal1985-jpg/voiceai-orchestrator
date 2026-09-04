import { useEffect, useState } from "react";
import { api, auth, type Me } from "../api";
import { StudentStatusCard } from "../klucoach/StudentStatusCard";
import { AiAskPanel } from "../ai/AiAskPanel";

export function AdminDashboard() {
  const [kpis, setKpis] = useState<Record<string, number> | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<{ kpis: Record<string, number> }>("/dashboard/admin")
      .then((d) => setKpis(d.kpis))
      .catch(() => undefined);
    auth.me().then(setMe).catch(() => undefined);
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
          <StudentStatusCard key={key} label={label} value={String(kpis[key] ?? 0)} />
        ))}
      </div>
      {me?.user.role === "INSTITUTION_ADMIN" ? (
        <AiAskPanel
          title="Institution insights"
          endpoint="/ai/institution/ask"
          prompts={[
            "How is attendance?",
            "Which batches need attention?",
            "How is academic performance?",
            "How many assignments are pending?",
          ]}
        />
      ) : null}
    </div>
  );
}
