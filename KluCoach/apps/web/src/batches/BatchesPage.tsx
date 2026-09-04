import { FormEvent, useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { listQuery, type Paged } from "../lib/paged";
import { useDebounced } from "../lib/useDebounced";
import { DataTable } from "../ui/DataTable";
import { createAppColumnHelper, type SortingState } from "../ui/table-engine";
import { AiAskPanel } from "../ai/AiAskPanel";

type Named = { id: string; name: string };
type BatchRow = {
  id: string;
  name: string;
  status: string;
  capacity: number | null;
  program: Named;
  branch: Named;
  academicYear?: Named;
  _count: { enrollments: number };
};

const helper = createAppColumnHelper<BatchRow>();
const columns = helper.columns([
  helper.accessor("name", { header: "Name" }),
  helper.accessor((row) => row.program.name, { id: "program", header: "Program" }),
  helper.accessor((row) => row.branch.name, { id: "branch", header: "Branch" }),
  helper.accessor((row) => row.academicYear?.name ?? "—", { id: "year", header: "Year" }),
  helper.accessor((row) => row._count.enrollments, { id: "enrollments", header: "Students" }),
  helper.accessor((row) => row.capacity ?? "—", { id: "capacity", header: "Capacity" }),
  helper.accessor("status", { header: "Status" }),
]);

const EMPTY: BatchRow[] = [];

export function BatchesPage() {
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
    queryKey: ["batches", qs],
    queryFn: () => api<Paged<BatchRow>>(`/batches?${qs}`),
    placeholderData: keepPreviousData,
  });

  const [lookups, setLookups] = useState<{ branches: Named[]; years: Named[]; programs: Named[] }>({
    branches: [],
    years: [],
    programs: [],
  });
  const [form, setForm] = useState({ name: "", branchId: "", academicYearId: "", programId: "", capacity: "40" });
  const [edit, setEdit] = useState<BatchRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<Named[]>("/branches"),
      api<Named[]>("/academic-years"),
      api<Named[]>("/programs"),
    ]).then(([branches, years, programs]) => {
      setLookups({ branches, years, programs });
      setForm((f) => ({
        ...f,
        branchId: f.branchId || branches[0]?.id || "",
        academicYearId: f.academicYearId || years[0]?.id || "",
        programId: f.programId || programs[0]?.id || "",
      }));
    }).catch(() => undefined);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await api("/batches", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          branchId: form.branchId,
          academicYearId: form.academicYearId,
          programId: form.programId,
          capacity: Number(form.capacity) || undefined,
        }),
      });
      setMsg("Batch created");
      setForm((f) => ({ ...f, name: "" }));
      await qc.invalidateQueries({ queryKey: ["batches"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create batch");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    await api(`/batches/${edit.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: editName, status: editStatus }),
    });
    setMsg("Batch updated");
    await qc.invalidateQueries({ queryKey: ["batches"] });
  }

  return (
    <div>
      <div className="top">
        <h1>Batches</h1>
      </div>
      <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
        <div className="label">Create batch</div>
        {error ? <p className="err">{error}</p> : null}
        {msg ? <p className="hint">{msg}</p> : null}
        <label htmlFor="batch-name">Name</label>
        <input id="batch-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label htmlFor="batch-branch">Branch</label>
        <select id="batch-branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} required>
          {lookups.branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="batch-program">Program</label>
        <select id="batch-program" value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} required>
          {lookups.programs.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="batch-year">Academic year</label>
        <select id="batch-year" value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })} required>
          {lookups.years.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="batch-capacity">Capacity</label>
        <input id="batch-capacity" type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        <button className="btn" type="submit">Create batch</button>
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
          searchPlaceholder="Search batches"
          filters={
            <select aria-label="Batch status filter" value={status} onChange={(e) => { setStatus(e.target.value); setPageIndex(0); }} style={{ maxWidth: 160 }}>
              <option value="">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          }
          loading={query.isLoading}
          error={query.isError ? "Could not load batches." : null}
          empty="No batches match this search."
          onRowClick={(row) => {
            setEdit(row);
            setEditName(row.name);
            setEditStatus(row.status);
          }}
          rowActions={(row) => (
            <button type="button" className="btn secondary" onClick={() => { setEdit(row); setEditName(row.name); setEditStatus(row.status); }}>
              Edit
            </button>
          )}
        />
      </div>
      {edit ? (
        <form className="card" style={{ marginTop: 16 }} onSubmit={save}>
          <div className="label">Edit batch</div>
          <label htmlFor="edit-batch-name">Name</label>
          <input id="edit-batch-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <label htmlFor="edit-batch-status">Status</label>
          <select id="edit-batch-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
          <button className="btn" type="submit">Save batch</button>
        </form>
      ) : null}
      {edit ? (
        <AiAskPanel
          key={edit.id}
          title={`AI insights · ${edit.name}`}
          endpoint={`/ai/batches/${edit.id}/ask`}
          prompts={[
            "Who needs attention?",
            "How is attendance?",
            "How is performance trending?",
            "Which students have pending assignments?",
          ]}
        />
      ) : null}
    </div>
  );
}
