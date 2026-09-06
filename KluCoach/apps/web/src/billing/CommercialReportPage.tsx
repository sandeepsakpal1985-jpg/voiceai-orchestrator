import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

type Report = {
  totals: {
    institutions: number;
    activeSubscriptions: number;
    billableStudents: number;
    grossPaise: number;
    klunexRealizationPaise: number;
    partnerSharePaise: number;
    outstandingPaise: number;
    expiredSubscriptions: number;
    renewalsDue: number;
  };
  rows: {
    institutionId: string;
    institution: string;
    commercialMode: string | null;
    billableStudents: number;
    studentUnitPricePaise: number;
    grossPaise: number;
    klunexRealizationPaise: number;
    partnerSharePaise: number;
    renewalDate: string | null;
    status: string | null;
    outstandingPaise: number;
  }[];
};

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

type PilotRow = {
  institutionId: string;
  institution: string;
  activeStudents: number;
  activeTeachers: number;
  activeParents: number;
  parentActivationRate: number;
  invitationsCreated: number;
  invitationsAccepted: number;
  invitationsExpired: number;
  weeklyActiveParents: number;
  attendanceDays: number;
  assessmentsCreated: number;
  assignmentsCreated: number;
  noticesCreated: number;
  notificationsDelivered: number;
  notificationsRead: number;
  safetrackEnabled: boolean;
  safetrackEvents: number;
  subscriptionStatus: string | null;
};

function PilotOps() {
  const metrics = useQuery({
    queryKey: ["pilot", "metrics"],
    queryFn: () => api<{ rows: PilotRow[] }>("/pilot/metrics"),
  });
  if (metrics.isError) return <p className="err">Could not load pilot operations</p>;
  if (!metrics.data) return <p className="hint">Loading pilot operations…</p>;
  return (
    <>
      <h2 className="label">Pilot operations</h2>
      <p className="hint">
        Counts only. No student names. KluNex / partner economics stay on this super-admin page, not the institute billing
        screen.
      </p>
      <div className="list" data-testid="pilot-ops">
        {metrics.data.rows.map((r) => (
          <div className="card" key={r.institutionId} data-testid={`pilot-ops-${r.institutionId}`}>
            <strong>{r.institution}</strong>
            <p className="hint">
              {r.activeStudents} students · {r.activeTeachers} teachers · {r.activeParents} parents activated (
              {Math.round(r.parentActivationRate * 100)}%) · weekly parents {r.weeklyActiveParents}
            </p>
            <p className="hint">
              Invitations {r.invitationsCreated} created / {r.invitationsAccepted} accepted / {r.invitationsExpired}{" "}
              expired · attendance days {r.attendanceDays} · assessments {r.assessmentsCreated} · assignments{" "}
              {r.assignmentsCreated} · notices {r.noticesCreated}
            </p>
            <p className="hint">
              Notifications {r.notificationsDelivered} delivered / {r.notificationsRead} read · SafeTrack{" "}
              {r.safetrackEnabled ? "on" : "off"} ({r.safetrackEvents} events) · {r.subscriptionStatus ?? "no subscription"}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

export function CommercialReportPage() {
  const report = useQuery({
    queryKey: ["billing", "report"],
    queryFn: () => api<Report>("/billing/report"),
  });
  const plans = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => api<{ id: string; code: string; name: string; isActive: boolean; amountPaisePerStudentYear: number }[]>("/billing/plans"),
  });
  if (report.isError) return <p className="err">Could not load commercial report</p>;
  if (!report.data) return <p>Loading…</p>;
  const t = report.data.totals;
  return (
    <div>
      <div className="top">
        <h1>Commercial</h1>
        <a className="btn secondary" href="/api/billing/report.csv">
          CSV
        </a>
      </div>
      <div className="kpis">
        <div className="card">
          <div className="label">Institutions</div>
          <div className="value">{t.institutions}</div>
        </div>
        <div className="card">
          <div className="label">Active subscriptions</div>
          <div className="value">{t.activeSubscriptions}</div>
        </div>
        <div className="card">
          <div className="label">Billable students</div>
          <div className="value">{t.billableStudents}</div>
        </div>
        <div className="card">
          <div className="label">KluNex realization</div>
          <div className="value">{rupees(t.klunexRealizationPaise)}</div>
        </div>
      </div>
      <p className="hint">
        Gross {rupees(t.grossPaise)} · Partner {rupees(t.partnerSharePaise)} · Outstanding {rupees(t.outstandingPaise)} ·
        Expired {t.expiredSubscriptions} · Renewals due {t.renewalsDue}
      </p>
      <PilotOps />
      <h2 className="label">Plans</h2>
      <div className="list">
        {plans.data?.map((p) => (
          <div className="card" key={p.id}>
            <strong>{p.code}</strong> {p.name} {p.isActive ? "(active)" : "(inactive)"} · {rupees(p.amountPaisePerStudentYear)} /
            student
          </div>
        ))}
      </div>
      <h2 className="label">Institutions</h2>
      <div className="list">
        {report.data.rows.map((r) => (
          <div className="card" key={r.institutionId}>
            <strong>{r.institution}</strong>
            <p className="hint">
              {r.commercialMode} · {r.status} · {r.billableStudents} students · {rupees(r.grossPaise)} gross · KluNex{" "}
              {rupees(r.klunexRealizationPaise)} · partner {rupees(r.partnerSharePaise)} · renew {r.renewalDate ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
