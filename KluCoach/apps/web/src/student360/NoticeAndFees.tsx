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
        <p className="hint">Fees not configured</p>
      ) : (
        <>
          <div className="value" data-testid="fee-status">
            {fees.label}
          </div>
          <p className="hint">
            {fees.label === "Paid"
              ? "No amount due"
              : `₹${(fees.pendingPaise / 100).toLocaleString("en-IN")} due`}
            {fees.dueDate ? ` · ${fees.dueDate}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
