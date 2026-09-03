import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

type PayStatus = { paymentsEnabled: boolean; provider: string };
type Checkout = { provider: string; orderId: string; amountPaise: number; currency: string; keyId: string; invoiceId: string };

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function InstitutionBillingPage() {
  const [params] = useSearchParams();
  const asOf = params.get("asOf");
  const qc = useQueryClient();
  const sub = useQuery({
    queryKey: ["billing", "subscription", asOf],
    queryFn: () => api<SubView>(`/billing/subscription${asOf ? `?asOf=${asOf}` : ""}`),
  });
  const invoices = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => api<InvoiceList>("/billing/invoices?page=1&pageSize=20"),
  });
  const payStatus = useQuery({
    queryKey: ["billing", "payments-status"],
    queryFn: () => api<PayStatus>("/billing/payments/status"),
  });
  const pay = useMutation({
    mutationFn: async (input: { invoiceId: string; outcome: "SUCCESS" | "FAILED" }) => {
      const session = await api<Checkout>(`/billing/invoices/${input.invoiceId}/pay`, { method: "POST" });
      if (session.provider === "test") {
        await api("/billing/payments/test-complete", {
          method: "POST",
          body: JSON.stringify({ orderId: session.orderId, outcome: input.outcome }),
        });
        return { session, outcome: input.outcome };
      }
      await new Promise<void>((resolve, reject) => {
        const w = window as unknown as { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } };
        const start = () => {
          if (!w.Razorpay) {
            reject(new Error("Checkout is unavailable"));
            return;
          }
          const rzp = new w.Razorpay({
            key: session.keyId,
            amount: session.amountPaise,
            currency: session.currency,
            order_id: session.orderId,
            name: "KluCoach",
            handler: () => resolve(),
            modal: { ondismiss: () => resolve() },
          });
          rzp.open();
        };
        if (w.Razorpay) start();
        else {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => start();
          script.onerror = () => reject(new Error("Checkout is unavailable"));
          document.body.appendChild(script);
        }
      });
      return { session, outcome: "PENDING" as const };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["billing", "invoices"] });
    },
  });
  if (sub.isError) return <p className="err">Could not load billing</p>;
  if (!sub.data) return <p>Loading…</p>;
  const s = sub.data.subscription;
  const e = sub.data.economics;
  const enabled = payStatus.data?.paymentsEnabled === true;
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
          <p>
            Gross {rupees(e.grossPaise)} · KluNex {rupees(e.klunexRealizationPaise)} · Partner {rupees(e.partnerSharePaise)}
          </p>
          <p className="hint">
            Unit {rupees(s.studentUnitPricePaise)} / student · {s.currency} · grace {s.gracePeriodDays} days
          </p>
        </section>
      ) : null}
      <h2 className="label" style={{ marginTop: 24 }}>
        Invoices
      </h2>
      {!enabled ? <p className="hint">Invoices are visible. Payment collection is not enabled on this environment.</p> : null}
      {pay.isError ? <p className="err">{pay.error instanceof Error ? pay.error.message : "Payment failed"}</p> : null}
      <div className="list">
        {invoices.data?.items.map((inv) => {
          const due = inv.totalPaise - inv.paidPaise;
          const payable = due > 0 && (inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID" || inv.status === "OVERDUE");
          return (
            <div className="card" key={inv.id} data-testid={`invoice-${inv.invoiceNumber}`}>
              <strong>{inv.invoiceNumber}</strong>
              <p className="hint">
                <span data-testid={`invoice-status-${inv.invoiceNumber}`}>{inv.status}</span>
                {" · "}
                {rupees(inv.totalPaise)} · paid {rupees(inv.paidPaise)}
                {inv.dueDate ? ` · due ${String(inv.dueDate).slice(0, 10)}` : ""}
              </p>
              {payable && enabled ? (
                <p>
                  <button className="btn" type="button" onClick={() => pay.mutate({ invoiceId: inv.id, outcome: "SUCCESS" })}>
                    Pay invoice
                  </button>
                  {payStatus.data?.provider === "test" ? (
                    <button className="btn" type="button" style={{ marginLeft: 8 }} onClick={() => pay.mutate({ invoiceId: inv.id, outcome: "FAILED" })}>
                      Simulate failure
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
