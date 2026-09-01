import { FormEvent, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type Me } from "../api";

type Batch = { id: string; name: string };
type Student = { id: string; firstName: string; lastName: string };
type Session = { id: string; startMinute: number; subject: { name: string } };
type RecordRow = { id: string; studentId: string; status: string; date: string; student?: Student };

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

export function AttendancePage() {
  const me = useOutletContext<Me>();
  const canWrite = ["INSTITUTION_ADMIN", "TEACHER", "STAFF", "SUPER_ADMIN"].includes(me.user.role);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState("2026-09-03");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [recent, setRecent] = useState<RecordRow[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const studentKey = students.map((s) => s.id).join(",");

  useEffect(() => {
    if (!canWrite) {
      api<RecordRow[]>("/attendance")
        .then(setRecent)
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load attendance"));
      return;
    }
    api<Batch[]>("/batches")
      .then((b) => {
        setBatches(b);
        const jee = b.find((row) => row.name.includes("JEE")) ?? b[0];
        if (jee) setBatchId(jee.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load batches"));
  }, [canWrite]);

  useEffect(() => {
    if (!canWrite || !batchId) return;
    api<Student[]>(`/students?batchId=${batchId}`)
      .then(setStudents)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load students"));
  }, [canWrite, batchId]);

  useEffect(() => {
    if (!canWrite || !batchId || !date) return;
    api<Session[]>(`/sessions?batchId=${batchId}&date=${date}`)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [canWrite, batchId, date]);

  useEffect(() => {
    if (!canWrite || !batchId || !date || !studentKey) return;
    let cancelled = false;
    dirtyRef.current = false;
    const qs = new URLSearchParams({ batchId, date });
    if (sessionId) qs.set("classSessionId", sessionId);
    api<RecordRow[]>(`/attendance?${qs}`)
      .then((rows) => {
        if (cancelled || dirtyRef.current) return;
        const next: Record<string, string> = {};
        for (const row of rows) {
          if (next[row.studentId] == null) next[row.studentId] = row.status;
        }
        setMarks(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canWrite, batchId, date, sessionId, studentKey]);

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
          classSessionId: sessionId || undefined,
          records: students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? "PRESENT" })),
        }),
      });
      setMsg("Attendance saved");
      const qs = new URLSearchParams({ batchId, date });
      if (sessionId) qs.set("classSessionId", sessionId);
      const rows = await api<RecordRow[]>(`/attendance?${qs}`);
      const next: Record<string, string> = {};
      for (const row of rows) {
        if (next[row.studentId] == null) next[row.studentId] = row.status;
      }
      setMarks(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save attendance");
    }
  }

  if (!canWrite) {
    return (
      <div>
        <div className="top">
          <h1>Attendance</h1>
        </div>
        {error ? <p className="err">{error}</p> : null}
        <div className="card">
          <div className="label">Recent attendance</div>
          {recent.map((row) => (
            <div className="row" key={row.id}>
              <span>
                {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"} · {String(row.date).slice(0, 10)}
              </span>
              <strong>{row.status}</strong>
            </div>
          ))}
          {recent.length === 0 ? <p className="hint">No attendance recorded yet.</p> : null}
        </div>
      </div>
    );
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
        <label htmlFor="attendance-session">Class session</label>
        <select id="attendance-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">Date only (no session)</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.subject.name}
            </option>
          ))}
        </select>
        {students.map((s) => (
          <div className="row" key={s.id}>
            <label htmlFor={`att-${s.id}`}>
              {s.firstName} {s.lastName}
            </label>
            <select
              id={`att-${s.id}`}
              aria-label={`${s.firstName} attendance`}
              value={marks[s.id] ?? "PRESENT"}
              onChange={(e) => {
                dirtyRef.current = true;
                setMarks((m) => ({ ...m, [s.id]: e.target.value }));
              }}
              style={{ maxWidth: 160, marginBottom: 0 }}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
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
