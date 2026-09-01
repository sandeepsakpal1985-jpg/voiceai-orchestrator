import type { Student360 } from "@klunex-edu/shared";

function label(status: string) {
  if (status === "SUBMITTED" || status === "REVIEWED") return "Submitted";
  if (status === "LATE") return "Overdue";
  return "Pending";
}

export function AssignmentSummary({ assignments }: { assignments: Student360["assignments"] }) {
  return (
    <section className="card" aria-labelledby="asg-360-heading">
      <h2 id="asg-360-heading" className="label">
        Assignments
      </h2>
      <div className="value">{assignments.pending}</div>
      <p className="hint">
        {assignments.pending} pending
        {assignments.overdue ? ` · ${assignments.overdue} overdue` : ""}
      </p>
      {assignments.items.map((row) => (
        <div className="row" key={row.id}>
          <span>
            {row.subject} · {row.title}
          </span>
          <strong>{label(row.status)}</strong>
        </div>
      ))}
      {assignments.items.length === 0 ? <p className="hint">No assignments.</p> : null}
    </section>
  );
}
