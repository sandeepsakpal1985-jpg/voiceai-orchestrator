import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, auth, type Me } from "../api";
import { StudentStatusCard } from "../klucoach/StudentStatusCard";
import { AiAskPanel } from "../ai/AiAskPanel";

type Onboarding = {
  items: { id: string; label: string; done: boolean; href: string }[];
  complete: number;
  total: number;
};

export function AdminDashboard() {
  const [kpis, setKpis] = useState<Record<string, number> | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<{ periodKey: string; byType: Record<string, number> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ kpis: Record<string, number> }>("/dashboard/admin"),
      api<Onboarding>("/dashboard/onboarding"),
    ])
      .then(([admin, onboard]) => {
        if (cancelled) return;
        setKpis(admin.kpis);
        setOnboarding(onboard);
      })
      .catch(() => undefined);
    auth.me().then((data) => {
      if (cancelled) return;
      setMe(data);
      if (data.user.role === "INSTITUTION_ADMIN") {
        api<{ periodKey: string; byType: Record<string, number> }>("/insights/summary")
          .then(setSummary)
          .catch(() => undefined);
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
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
      {onboarding ? (
        <section className="card" data-testid="onboarding-checklist" style={{ marginBottom: 16 }}>
          <h2 className="label">KluCoach Setup</h2>
          <p className="hint" data-testid="onboarding-progress">
            {onboarding.complete} / {onboarding.total} complete
          </p>
          <ul className="onboarding-list">
            {onboarding.items.map((item) => (
              <li key={item.id} data-testid={`onboarding-${item.id}`} data-done={item.done ? "true" : "false"}>
                <Link to={item.href} aria-label={`Setup: ${item.label}`}>
                  <span aria-hidden="true">{item.done ? "✓" : "○"} </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="kpis">
        {items.map(([key, label]) => (
          <StudentStatusCard key={key} label={label} value={String(kpis[key] ?? 0)} />
        ))}
      </div>
      {summary ? (
        <section className="card" data-testid="insight-summary" style={{ marginBottom: 16 }}>
          <h2 className="label">Proactive insights</h2>
          <p className="hint" data-testid="insight-summary-attendance">
            {summary.byType.ATTENDANCE_DECLINE ?? 0} students had attendance declines greater than the configured threshold this period.
          </p>
        </section>
      ) : null}
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
