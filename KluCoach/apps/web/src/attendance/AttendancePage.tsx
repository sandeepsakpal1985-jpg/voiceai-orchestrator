import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";

type Batch = { id: string; name: string };
type Student = { id: string; firstName: string; lastName: string };

export function AttendancePage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Batch[]>("/batches")
      .then((b) => {
        setBatches(b);
        if (b[0]) setBatchId(b[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load batches"));
  }, []);

  useEffect(() => {
    if (!batchId) return;
    api<Student[]>(`/students?batchId=${batchId}`)
      .then(setStudents)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load students"));
  }, [batchId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    try {
      await api("/attendance", {
        method: "POST",
        body: JSON.stringify({
          batchId,
          date,
          records: students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? "PRESENT" })),
        }),
      });
      setMsg("Attendance saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save attendance");
    }
  }

  return (
    <div>
      <div className="top">
        <h1>Attendance</h1>
      </div>
      <form onSubmit={submit} className="card">
        {error ? <p className="err">{error}</p> : null}
        <label htmlFor="attendance-batch">Batch</label>
        <select id="attendance-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <label htmlFor="attendance-date">Date</label>
        <input id="attendance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        {students.map((s) => (
          <div className="row" key={s.id}>
            <label htmlFor={`att-${s.id}`}>
              {s.firstName} {s.lastName}
            </label>
            <select
              id={`att-${s.id}`}
              aria-label={`${s.firstName} attendance`}
              value={marks[s.id] ?? "PRESENT"}
              onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}
              style={{ maxWidth: 160, marginBottom: 0 }}
            >
              <option value="PRESENT">PRESENT</option>
              <option value="ABSENT">ABSENT</option>
              <option value="LATE">LATE</option>
              <option value="EXCUSED">EXCUSED</option>
            </select>
          </div>
        ))}
        <button className="btn" type="submit">
          Save attendance
        </button>
        {msg ? <p className="hint">{msg}</p> : null}
      </form>
    </div>
  );
}
