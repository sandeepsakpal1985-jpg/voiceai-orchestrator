import { useEffect, useState } from "react";
import { api } from "../api";

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  status: string;
  branch?: { name: string };
  enrollments: { batch: { name: string } }[];
};

export function StudentsPage() {
  const [rows, setRows] = useState<Student[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<Student[]>(`/students${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(setRows).catch(() => undefined);
  }, [q]);
  return (
    <div>
      <div className="top">
        <h1>Students</h1>
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Admission</th>
              <th>Name</th>
              <th>Batch</th>
              <th>Branch</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.admissionNumber}</td>
                <td>
                  {s.firstName} {s.lastName}
                </td>
                <td>{s.enrollments[0]?.batch.name ?? "—"}</td>
                <td>{s.branch?.name ?? "—"}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
