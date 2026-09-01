import { useState } from "react";
import { DataTable } from "../ui/DataTable";
import { createAppColumnHelper } from "../ui/table-engine";
import { useStudentsQuery, type StudentListRow } from "./queries";

const helper = createAppColumnHelper<StudentListRow>();
const columns = helper.columns([
  helper.accessor("admissionNumber", { header: "Admission" }),
  helper.accessor((row) => `${row.firstName} ${row.lastName}`, { id: "name", header: "Name" }),
  helper.accessor((row) => row.enrollments[0]?.batch.name ?? "—", { id: "batch", header: "Batch" }),
  helper.accessor((row) => row.branch?.name ?? "—", { id: "branch", header: "Branch" }),
  helper.accessor("status", { header: "Status" }),
]);

const EMPTY: StudentListRow[] = [];

export function StudentsPage() {
  const [q, setQ] = useState("");
  const query = useStudentsQuery(q);

  return (
    <div>
      <div className="top">
        <h1>Students</h1>
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
      </div>
      <div className="card">
        {query.isError ? <p className="err">Could not load students.</p> : null}
        {query.isLoading ? (
          <p className="hint">Loading…</p>
        ) : (
          <DataTable columns={columns} data={query.data ?? EMPTY} empty="No students match this search." />
        )}
      </div>
    </div>
  );
}
