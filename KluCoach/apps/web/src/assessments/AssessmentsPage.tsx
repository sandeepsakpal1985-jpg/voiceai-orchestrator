import { useEffect, useState } from "react";
import { api } from "../api";

type Assessment = { id: string; name: string; date: string; status: string; subject: { name: string }; batch: { name: string } };
type Result = { id: string; percentage: string; studentId: string; assessment: { name: string; subject: { name: string } } };

export function AssessmentsPage() {
  const [tests, setTests] = useState<Assessment[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  useEffect(() => {
    api<Assessment[]>("/assessments").then(setTests).catch(() => undefined);
    api<Result[]>("/results").then(setResults).catch(() => undefined);
  }, []);
  return (
    <div>
      <div className="top">
        <h1>Tests & results</h1>
      </div>
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
            <div className="row" key={r.id}>
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
