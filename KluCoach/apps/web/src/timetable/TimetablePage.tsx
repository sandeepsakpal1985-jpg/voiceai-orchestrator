import { useEffect, useState } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { api } from "../api";

type Slot = {
  id: string;
  dayOfWeek: string;
  startMinute: number;
  endMinute: number;
  room: string | null;
  subject: { name: string };
  batch: { name: string };
};

function hhmm(min: number) {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  const date = setMinutes(setHours(new Date(2000, 0, 1), hours), minutes);
  return format(date, "h:mm a");
}

export function TimetablePage() {
  const [rows, setRows] = useState<Slot[]>([]);
  useEffect(() => {
    api<Slot[]>("/timetable").then(setRows).catch(() => undefined);
  }, []);
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  return (
    <div>
      <div className="top">
        <h1>Timetable</h1>
      </div>
      {days.map((d) => {
        const items = rows.filter((r) => r.dayOfWeek === d);
        if (!items.length) return null;
        return (
          <div className="card" key={d} style={{ marginBottom: 12 }}>
            <div className="label">{d}</div>
            {items.map((s) => (
              <div className="row" key={s.id}>
                <span>
                  {hhmm(s.startMinute)} {s.subject.name}
                </span>
                <span className="hint">
                  {s.batch.name}
                  {s.room ? ` · ${s.room}` : ""}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
