import { FormEvent, useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { listQuery, type Paged } from "../lib/paged";
import { useDebounced } from "../lib/useDebounced";
import { DataTable } from "../ui/DataTable";
import { createAppColumnHelper, type SortingState } from "../ui/table-engine";

type Named = { id: string; name: string };
type TeacherRow = {
  id: string;
  name: string;
  employeeId: string | null;
  email: string | null;
  status: string;
  subjects: { subject: Named }[];
  batches: { batch: Named }[];
  branches: { branch: Named }[];
};

const helper = createAppColumnHelper<TeacherRow>();
const columns = helper.columns([
  helper.accessor("name", { header: "Name" }),
  helper.accessor("employeeId", { header: "Employee ID" }),
  helper.accessor("email", { header: "Email" }),
  helper.accessor("status", { header: "Status" }),
  helper.accessor((row) => row.subjects.map((s) => s.subject.name).join(", ") || "—", { id: "subjects", header: "Subjects" }),
  helper.accessor((row) => row.batches.map((b) => b.batch.name).join(", ") || "—", { id: "batches", header: "Batches" }),
]);

const EMPTY: TeacherRow[] = [];

export function TeachersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedQ = useDebounced(q);
  const sort = sorting[0];
  const qs = listQuery({
    pageIndex,
    q: debouncedQ,
    sort: sort?.id,
    dir: sort ? (sort.desc ? "desc" : "asc") : undefined,
    extra: { status: status || undefined },
  });
  const query = useQuery({
    queryKey: ["teachers", qs],
    queryFn: () => api<Paged<TeacherRow>>(`/teachers?${qs}`),
    placeholderData: keepPreviousData,
  });

  const [lookups, setLookups] = useState<{ branches: Named[]; batches: Named[]; subjects: Named[] }>({
    branches: [],
    batches: [],
    subjects: [],
  });
  const [form, setForm] = useState({ name: "", email: "", employeeId: "", branchIds: "", batchIds: "", subjectIds: "" });
  const [edit, setEdit] = useState<TeacherRow | null>(null);
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api<Named[]>("/branches"), api<Named[]>("/batches"), api<Named[]>("/subjects")]).then(([branches, batches, subjects]) => {
      setLookups({ branches, batches, subjects });
    }).catch(() => undefined);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await api("/teachers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          employeeId: form.employeeId || undefined,
          branchIds: form.branchIds ? [form.branchIds] : undefined,
          batchIds: form.batchIds ? [form.batchIds] : undefined,
          subjectIds: form.subjectIds ? [form.subjectIds] : undefined,
        }),
      });
      setMsg("Teacher created");
      setForm({ name: "", email: "", employeeId: "", branchIds: "", batchIds: "", subjectIds: "" });
      await qc.invalidateQueries({ queryKey: ["teachers"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create teacher");
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setError("");
    await api(`/teachers/${edit.id}`, { method: "PATCH", body: JSON.stringify({ status: editStatus, name: edit.name }) });
    setMsg("Teacher updated");
    await qc.invalidateQueries({ queryKey: ["teachers"] });
  }

  return (
    <div>
      <div className="top">
        <h1>Teachers</h1>
      </div>
      <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
        <div className="label">Add teacher</div>
        {error ? <p className="err">{error}</p> : null}
        {msg ? <p className="hint">{msg}</p> : null}
        <label htmlFor="teacher-name">Name</label>
        <input id="teacher-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label htmlFor="teacher-email">Email</label>
        <input id="teacher-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label htmlFor="teacher-employee">Employee ID</label>
        <input id="teacher-employee" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
        <label htmlFor="teacher-branch">Branch</label>
        <select id="teacher-branch" value={form.branchIds} onChange={(e) => setForm({ ...form, branchIds: e.target.value })}>
          <option value="">None</option>
          {lookups.branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="teacher-batch">Batch</label>
        <select id="teacher-batch" value={form.batchIds} onChange={(e) => setForm({ ...form, batchIds: e.target.value })}>
          <option value="">None</option>
          {lookups.batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="teacher-subject">Subject</label>
        <select id="teacher-subject" value={form.subjectIds} onChange={(e) => setForm({ ...form, subjectIds: e.target.value })}>
          <option value="">None</option>
          {lookups.subjects.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button className="btn" type="submit">Create teacher</button>
      </form>
      <div className="card">
        <DataTable
          columns={columns}
          data={query.data?.items ?? EMPTY}
          total={query.data?.total}
          pageIndex={pageIndex}
          onPageChange={setPageIndex}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPageIndex(0);
          }}
          search={q}
          onSearchChange={(value) => {
            setQ(value);
            setPageIndex(0);
          }}
          searchPlaceholder="Search teachers"
          filters={
            <select aria-label="Teacher status filter" value={status} onChange={(e) => { setStatus(e.target.value); setPageIndex(0); }} style={{ maxWidth: 160 }}>
              <option value="">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          }
          loading={query.isLoading}
          error={query.isError ? "Could not load teachers." : null}
          empty="No teachers match this search."
          onRowClick={(row) => {
            setEdit(row);
            setEditStatus(row.status);
          }}
          rowActions={(row) => (
            <button type="button" className="btn secondary" onClick={() => { setEdit(row); setEditStatus(row.status); }}>
              Edit
            </button>
          )}
        />
      </div>
      {edit ? (
        <form className="card" style={{ marginTop: 16 }} onSubmit={saveEdit}>
          <div className="label">Edit teacher</div>
          <p>
            {edit.name} · {edit.employeeId ?? "no employee id"}
          </p>
          <p className="hint">
            Subjects: {edit.subjects.map((s) => s.subject.name).join(", ") || "—"} · Batches: {edit.batches.map((b) => b.batch.name).join(", ") || "—"} · Branches: {edit.branches.map((b) => b.branch.name).join(", ") || "—"}
          </p>
          <label htmlFor="teacher-status">Status</label>
          <select id="teacher-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
          <button className="btn" type="submit">Save teacher</button>
        </form>
      ) : null}
    </div>
  );
}
