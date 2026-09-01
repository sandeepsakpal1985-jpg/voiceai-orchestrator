import type { Student360 } from "@klunex-edu/shared";

export function NoticeSummary({ notices }: { notices: Student360["notices"] }) {
  return (
    <section className="card" aria-labelledby="notice-360-heading">
      <h2 id="notice-360-heading" className="label">
        Notices
      </h2>
      {notices.map((n) => (
        <div className="row" key={n.id}>
          {n.title}
        </div>
      ))}
      {notices.length === 0 ? <p className="hint">No notices.</p> : null}
    </section>
  );
}

export function FeeStatus({ fees }: { fees: Student360["fees"] }) {
  return (
    <section className="card" aria-labelledby="fee-360-heading">
      <h2 id="fee-360-heading" className="label">
        Fees
      </h2>
      {!fees ? (
        <p className="hint">Fees not configured.</p>
      ) : fees.pendingPaise <= 0 ? (
        <>
          <div className="value">Paid</div>
          <p className="hint">₹0 pending</p>
        </>
      ) : (
        <>
          <div className="value">₹{(fees.pendingPaise / 100).toLocaleString("en-IN")}</div>
          <p className="hint">
            {fees.status}
            {fees.dueDate ? ` · due ${fees.dueDate}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
