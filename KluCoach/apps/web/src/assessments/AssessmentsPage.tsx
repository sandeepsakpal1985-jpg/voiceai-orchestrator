import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";

type Named = { id: string; name: string };
type Assessment = { id: string; name: string; date: string; status: string; maxMarks?: number; subject: Named; batch: Named };
type Student = { id: string; firstName: string; lastName: string };
type Result = { percentage: string | number; studentId: string; assessment: { name: string; subject: Named } };

export function AssessmentsPage() {
  const [tests, setTests] = useState<Assessment[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [batches, setBatches] = useState<Named[]>([]);
  const [subjects, setSubjects] = useState<Named[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    batchId: "",
    subjectId: "",
    date: new Date().toISOString().slice(0, 10),
    maxMarks: "100",
    passingMarks: "35",
  });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function refresh() {
    const [t, r, b, s] = await Promise.all([
      api<Assessment[]>("/assessments"),
      api<Result[]>("/results"),
      api<Named[]>("/batches"),
      api<Named[]>("/subjects"),
    ]);
    setTests(t);
    setResults(r);
    setBatches(b);
    setSubjects(s);
    setForm((f) => ({
      ...f,
      batchId: f.batchId || b[0]?.id || "",
      subjectId: f.subjectId || s.find((row) => row.name === "Physics")?.id || s[0]?.id || "",
    }));
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!form.batchId) return;
    api<Student[]>(`/students?batchId=${form.batchId}`)
      .then(setStudents)
      .catch(() => setStudents([]));
  }, [form.batchId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const created = await api<Assessment>("/assessments", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          batchId: form.batchId,
          subjectId: form.subjectId,
          date: form.date,
          maxMarks: Number(form.maxMarks),
          passingMarks: Number(form.passingMarks),
        }),
      });
      setSelectedId(created.id);
      setMsg("Assessment created. Enter marks below.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create assessment");
    }
  }

  async function saveMarks(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const max = Number(form.maxMarks);
    const payload = students.map((s) => ({ studentId: s.id, marks: Number(marks[s.id] ?? 0) }));
    const invalid = payload.find((r) => r.marks < 0 || r.marks > max);
    if (invalid) {
      setError(`Marks must be between 0 and ${max}.`);
      return;
    }
    try {
      await api(`/assessments/${selectedId}/results`, {
        method: "POST",
        body: JSON.stringify({ results: payload }),
      });
      setMsg("Results saved");
      setResults(await api<Result[]>("/results"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save results");
    }
  }

  return (
    <div>
      <div className="top">
        <h1>Tests & results</h1>
      </div>
      <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
        <div className="label">Create assessment</div>
        {error ? <p className="err">{error}</p> : null}
        {msg ? <p className="hint">{msg}</p> : null}
        <label htmlFor="assessment-name">Assessment name</label>
        <input id="assessment-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label htmlFor="assessment-batch">Batch</label>
        <select id="assessment-batch" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })} required>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="assessment-subject">Subject</label>
        <select id="assessment-subject" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
          {subjects.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="assessment-date">Date</label>
        <input id="assessment-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <label htmlFor="assessment-max">Maximum marks</label>
        <input id="assessment-max" type="number" min={1} value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} required />
        <label htmlFor="assessment-pass">Passing marks</label>
        <input id="assessment-pass" type="number" min={0} value={form.passingMarks} onChange={(e) => setForm({ ...form, passingMarks: e.target.value })} required />
        <button className="btn" type="submit">Create assessment</button>
      </form>
      {selectedId ? (
        <form className="card" onSubmit={saveMarks} style={{ marginBottom: 16 }}>
          <div className="label">Enter marks</div>
          {students.map((s) => (
            <div className="row" key={s.id}>
              <label htmlFor={`marks-${s.id}`}>
                {s.firstName} {s.lastName}
              </label>
              <input
                id={`marks-${s.id}`}
                aria-label={`${s.firstName} marks`}
                type="number"
                min={0}
                value={marks[s.id] ?? ""}
                onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}
                style={{ maxWidth: 120, marginBottom: 0 }}
              />
            </div>
          ))}
          <button className="btn" type="submit">Save results</button>
        </form>
      ) : null}
      <div className="grid">
        <div className="card">
          <div className="label">Assessments</div>
          {tests.map((t) => (
            <div className="row" key={t.id}>
              <span>
                {t.name} · {t.subject.name}
              </span>
              <span className="hint">{t.batch.name}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="label">Recent marks</div>
          {results.map((r) => (
            <div className="row" key={`${r.studentId}-${r.assessment.name}`}>
              <span>
                {r.assessment.subject.name} · {r.assessment.name}
              </span>
              <strong>{Number(r.percentage)}%</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
