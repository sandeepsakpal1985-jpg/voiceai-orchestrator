import { useEffect, useState } from "react";
import { api } from "../api";

type Batch = { id: string; name: string; program: { name: string }; branch: { name: string }; _count: { enrollments: number } };

export function BatchesPage() {
  const [rows, setRows] = useState<Batch[]>([]);
  useEffect(() => {
    api<Batch[]>("/batches").then(setRows).catch(() => undefined);
  }, []);
  return (
    <div>
      <div className="top">
        <h1>Batches</h1>
      </div>
      <div className="kpis">
        {rows.map((b) => (
          <div className="card" key={b.id}>
            <div className="label">
              {b.program.name} · {b.branch.name}
            </div>
            <div className="value" style={{ fontSize: "1.15rem" }}>
              {b.name}
            </div>
            <div className="hint">{b._count.enrollments} students</div>
          </div>
        ))}
      </div>
    </div>
  );
}
