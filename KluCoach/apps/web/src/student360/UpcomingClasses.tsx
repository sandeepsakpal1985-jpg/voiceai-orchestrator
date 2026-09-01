import { format, setHours, setMinutes } from "date-fns";
import type { Student360 } from "@klunex-edu/shared";

function hhmm(min: number) {
  const date = setMinutes(setHours(new Date(2000, 0, 1), Math.floor(min / 60)), min % 60);
  return format(date, "h:mm a");
}

export function UpcomingClasses({ upcoming }: { upcoming: Student360["upcoming"] }) {
  return (
    <section className="card" aria-labelledby="up-360-heading">
      <h2 id="up-360-heading" className="label">
        Upcoming classes
      </h2>
      {upcoming.map((row) => (
        <div className="row" key={row.id}>
          <span>
            {row.date} · {hhmm(row.startMinute)} {row.subject.name}
          </span>
          <span className="hint">
            {row.teacher?.name ?? "Teacher"}
            {row.room ? ` · ${row.room}` : ""}
          </span>
        </div>
      ))}
      {upcoming.length === 0 ? <p className="hint">No upcoming classes.</p> : null}
    </section>
  );
}
