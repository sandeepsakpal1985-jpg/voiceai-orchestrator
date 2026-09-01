import type { Student360 } from "@klunex-edu/shared";

const TREND: Record<string, string> = {
  IMPROVING: "Improving",
  STABLE: "Stable",
  DECLINING: "Declining",
  INSUFFICIENT_DATA: "Not enough data",
};

export function AttendanceCard({ attendance }: { attendance: Student360["attendance"] }) {
  return (
    <section className="card" aria-labelledby="att-360-heading">
      <h2 id="att-360-heading" className="label">
        Attendance
      </h2>
      <div className="value">{attendance.percent == null ? "—" : `${attendance.percent}%`}</div>
      <p className="hint">
        {attendance.percent == null
          ? "Attendance data unavailable"
          : `Present ${attendance.present} · Absent ${attendance.absent} · Late ${attendance.late}`}
      </p>
      <p className="hint">Trend: {TREND[attendance.trend]}</p>
      <div className="label" style={{ marginTop: 12 }}>
        Recent
      </div>
      {attendance.recent.map((row, i) => (
        <div className="row" key={`${row.date}-${i}`}>
          <span>{row.date}</span>
          <strong>{row.status}</strong>
        </div>
      ))}
      {attendance.recent.length === 0 ? <p className="hint">No attendance recorded yet.</p> : null}
    </section>
  );
}
