import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";

type Batch = { id: string; name: string };
type Student = { id: string; firstName: string; lastName: string; enrollments: { batchId?: string; batch: { id: string } }[] };

export function AttendancePage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<Batch[]>("/batches").then((b) => {
      setBatches(b);
      if (b[0]) setBatchId(b[0].id);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!batchId) return;
    api<Student[]>("/students").then((all) => {
      const inBatch = all.filter((s) => s.enrollments.some((e) => e.batch.id === batchId));
      setStudents(inBatch);
    }).catch(() => undefined);
  }, [batchId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    await api("/attendance", {
      method: "POST",
      body: JSON.stringify({
        batchId,
        date: new Date().toISOString().slice(0, 10),
        records: students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? "PRESENT" })),
      }),
    });
    setMsg("Attendance saved");
  }

  return (
    <div>
      <div className="top">
        <h1>Attendance</h1>
      </div>
      <form onSubmit={submit} className="card">
        <label>Batch</label>
        <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {students.map((s) => (
          <div className="row" key={s.id}>
            <span>
              {s.firstName} {s.lastName}
            </span>
            <select value={marks[s.id] ?? "PRESENT"} onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}>
              <option>PRESENT</option>
              <option>ABSENT</option>
              <option>LATE</option>
              <option>EXCUSED</option>
            </select>
          </div>
        ))}
        <button className="btn" type="submit">Save</button>
        {msg && <p className="hint">{msg}</p>}
      </form>
    </div>
  );
}
