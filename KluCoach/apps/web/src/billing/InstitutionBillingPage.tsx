import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";

type SubView = {
  institution: { name: string; billingMode: string; nonBillable: boolean };
  subscription: {
    planName: string;
    planCode: string;
    status: string;
    commercialMode: string;
    currency: string;
    renewalDate: string | null;
    endsAt: string | null;
    studentUnitPricePaise: number;
    klunexUnitRealizationPaise: number;
    partnerUnitSharePaise: number;
    gracePeriodDays: number;
  } | null;
  billableStudents: number;
  economics: { grossPaise: number; klunexRealizationPaise: number; partnerSharePaise: number } | null;
};

type InvoiceList = {
  items: {
    id: string;
    invoiceNumber: string;
    status: string;
    totalPaise: number;
    paidPaise: number;
    dueDate: string | null;
    issueDate: string;
  }[];
};

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function InstitutionBillingPage() {
  const [params] = useSearchParams();
  const asOf = params.get("asOf");
  const sub = useQuery({
    queryKey: ["billing", "subscription", asOf],
    queryFn: () => api<SubView>(`/billing/subscription${asOf ? `?asOf=${asOf}` : ""}`),
  });
  const invoices = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => api<InvoiceList>("/billing/invoices?page=1&pageSize=20"),
  });
  if (sub.isError) return <p className="err">Could not load billing</p>;
  if (!sub.data) return <p>Loading…</p>;
  const s = sub.data.subscription;
  const e = sub.data.economics;
  return (
    <div>
      <div className="top">
        <h1>Billing</h1>
      </div>
      {sub.data.institution.nonBillable ? <p className="hint">Demo / non-billable institution — academic access is not gated.</p> : null}
      {!s ? (
        <p className="hint">No subscription configured.</p>
      ) : (
        <div className="kpis">
          <div className="card">
            <div className="label">Plan</div>
            <div className="value">{s.planName}</div>
            <p className="hint">{s.commercialMode}</p>
          </div>
          <div className="card">
            <div className="label">Status</div>
            <div className="value" data-testid="subscription-status">
              {s.status}
            </div>
          </div>
          <div className="card">
            <div className="label">Billable students</div>
            <div className="value" data-testid="billable-students">
              {sub.data.billableStudents}
            </div>
          </div>
          <div className="card">
            <div className="label">Renewal</div>
            <div className="value">{s.renewalDate ?? "—"}</div>
          </div>
        </div>
      )}
      {e && s ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 className="label">Current period (contracted)</h2>
          <p>Gross {rupees(e.grossPaise)} · KluNex {rupees(e.klunexRealizationPaise)} · Partner {rupees(e.partnerSharePaise)}</p>
          <p className="hint">
            Unit {rupees(s.studentUnitPricePaise)} / student · {s.currency} · grace {s.gracePeriodDays} days
          </p>
        </section>
      ) : null}
      <h2 className="label" style={{ marginTop: 24 }}>
        Invoices
      </h2>
      <div className="list">
        {invoices.data?.items.map((inv) => (
          <div className="card" key={inv.id}>
            <strong>{inv.invoiceNumber}</strong>
            <p className="hint">
              {inv.status} · {rupees(inv.totalPaise)} · paid {rupees(inv.paidPaise)}
              {inv.dueDate ? ` · due ${String(inv.dueDate).slice(0, 10)}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
