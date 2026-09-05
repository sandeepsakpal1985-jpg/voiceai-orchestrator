import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";

type Gate = { id: string; name: string; code: string };
type Student = { id: string; firstName: string; lastName: string };
type TodayRow = {
  id: string;
  type: string;
  gateName: string;
  studentName: string | null;
  occurredAt: string;
};

export function GatesPage() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [today, setToday] = useState<TodayRow[]>([]);
  const [studentId, setStudentId] = useState("");
  const [gateId, setGateId] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [g, s, t] = await Promise.all([
      api<Gate[]>("/access/gates"),
      api<Student[] | { items: Student[] }>("/students"),
      api<{ items: TodayRow[] }>("/access/today"),
    ]);
    const list = Array.isArray(s) ? s : s.items ?? [];
    setGates(g);
    setStudents(list);
    setToday(t.items);
    setGateId((id) => id || g[0]?.id || "");
    setStudentId((id) => id || list.find((row) => row.firstName === "Aarav")?.id || list[0]?.id || "");
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  async function punch(e: FormEvent, type: "ENTRY" | "EXIT") {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await api("/access/punch", {
        method: "POST",
        body: JSON.stringify({ studentId, gateId, type }),
      });
      setMsg(type === "ENTRY" ? "Entry recorded" : "Exit recorded");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record movement");
    }
  }

  return (
    <div>
      <div className="top">
        <h1>Gate</h1>
      </div>
      <p className="hint">RFID/NFC entry and exit. GPS is not part of this phase.</p>
      <form className="card" style={{ marginBottom: 16 }} onSubmit={(e) => punch(e, "ENTRY")}>
        <label htmlFor="gate-student">Student</label>
        <select id="gate-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </select>
        <label htmlFor="gate-name">Gate</label>
        <select id="gate-name" value={gateId} onChange={(e) => setGateId(e.target.value)}>
          {gates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Record entry
        </button>
        <button className="btn secondary" type="button" onClick={(e) => punch(e, "EXIT")}>
          Record exit
        </button>
        {msg ? <p className="hint">{msg}</p> : null}
        {error ? <p className="err">{error}</p> : null}
      </form>
      <section className="card" data-testid="gate-today">
        <h2 className="label">Today</h2>
        {today.length === 0 ? <p className="hint">No scans yet today.</p> : null}
        {today.map((row) => (
          <div className="row" key={row.id}>
            <span>
              {row.studentName ?? "Unknown card"} · {row.type} · {row.gateName}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
