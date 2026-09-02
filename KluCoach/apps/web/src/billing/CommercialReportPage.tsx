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
