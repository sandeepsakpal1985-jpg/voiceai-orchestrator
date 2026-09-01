import type { Student360 } from "@klunex-edu/shared";

const TREND: Record<string, string> = {
  IMPROVING: "Improving",
  STABLE: "Stable",
  DECLINING: "Declining",
  INSUFFICIENT_DATA: "Not enough data yet",
};

export function AcademicSummary({ academic }: { academic: Student360["academic"] }) {
  return (
    <section className="card" aria-labelledby="acad-360-heading">
      <h2 id="acad-360-heading" className="label">
        Academic
      </h2>
      <div className="value">{academic.average == null ? "—" : `${academic.average}%`}</div>
      <p className="hint">Trend: {TREND[academic.trend]}</p>
      {academic.bySubject.map((row) => (
        <div className="row" key={row.subject}>
          <span>{row.subject}</span>
          <strong>{row.average}%</strong>
        </div>
      ))}
      {academic.bySubject.length === 0 ? <p className="hint">No assessments yet.</p> : null}
    </section>
  );
}

export function RecentResults({ academic }: { academic: Student360["academic"] }) {
  return (
    <section className="card" aria-labelledby="results-360-heading">
      <h2 id="results-360-heading" className="label">
        Recent results
      </h2>
      {academic.latest.map((row, i) => (
        <div className="row" key={`${row.assessment.name}-${i}`}>
          <span>
            {row.assessment.subject.name} · {row.assessment.name}
          </span>
          <strong>
            {row.maxMarks != null ? `${row.marks}/${row.maxMarks} · ` : ""}
            {row.percentage}%
          </strong>
        </div>
      ))}
      {academic.latest.length === 0 ? <p className="hint">No assessments yet.</p> : null}
    </section>
  );
}
