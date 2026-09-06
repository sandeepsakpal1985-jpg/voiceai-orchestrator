import { FormEvent, useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api, type Me } from "../api";
import { listQuery, type Paged } from "../lib/paged";
import { useDebounced } from "../lib/useDebounced";
import { DataTable } from "../ui/DataTable";
import { createAppColumnHelper, type SortingState } from "../ui/table-engine";

type Named = { id: string; name: string };
type Submission = { id: string; status: string; studentId: string };
type Assignment = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  subject: Named;
  batch: Named;
  submissions: Submission[];
};

const helper = createAppColumnHelper<Assignment>();
const columns = helper.columns([
  helper.accessor("title", { header: "Title" }),
  helper.accessor((row) => row.subject.name, { id: "subject", header: "Subject" }),
  helper.accessor((row) => row.batch.name, { id: "batch", header: "Batch" }),
  helper.accessor((row) => row.dueAt.slice(0, 10), { id: "due", header: "Due" }),
  helper.accessor((row) => {
    const own = row.submissions[0]?.status;
    if (own === "SUBMITTED") return "Submitted";
    if (own === "PENDING") return "Pending";
    if (own === "LATE") return "Overdue";
    const submitted = row.submissions.filter((s) => s.status === "SUBMITTED").length;
    return `${submitted} submitted`;
  }, { id: "status", header: "Status" }),
]);

const EMPTY: Assignment[] = [];

export function AssignmentsPage() {
  const me = useOutletContext<Me>();
  const isStudent = me.user.role === "STUDENT";
  const canCreate = ["INSTITUTION_ADMIN", "TEACHER", "SUPER_ADMIN"].includes(me.user.role);
  if (canCreate) return <AdminAssignments />;
  return <LearnerAssignments isStudent={isStudent} />;
}

function LearnerAssignments({ isStudent }: { isStudent: boolean }) {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function refresh() {
    setRows(await api<Assignment[]>("/assignments"));
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load assignments"));
  }, []);

  async function submit(row: Assignment) {
    setError("");
    setMsg("");
    try {
      await api(`/assignments/${row.id}/submit`, { method: "POST", body: JSON.stringify({ status: "SUBMITTED" }) });
      setMsg("Assignment submitted");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    }
  }

  return (
    <div>
      <div className="top">
        <h1>Assignments</h1>
      </div>
      {error ? <p className="err">{error}</p> : null}
      {msg ? <p className="hint">{msg}</p> : null}
      <div className="card">
        <DataTable
          columns={columns}
          data={rows.length ? rows : EMPTY}
          empty="No assignments yet."
          rowActions={
            isStudent
              ? (row) =>
                  row.submissions[0]?.status === "SUBMITTED" ? (
                    <span className="hint">Submitted</span>
                  ) : (
                    <button type="button" className="btn" onClick={() => submit(row)}>
                      Submit
                    </button>
                  )
              : undefined
          }
        />
      </div>
    </div>
  );
}

function AdminAssignments() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [lookups, setLookups] = useState<{ batches: Named[]; subjects: Named[] }>({ batches: [], subjects: [] });
  const [form, setForm] = useState({ title: "", description: "", batchId: "", subjectId: "", dueAt: "2026-09-20" });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const debouncedQ = useDebounced(q);
  const qs = listQuery({ pageIndex, q: debouncedQ });
  const query = useQuery({
    queryKey: ["assignments", qs],
    queryFn: () => api<Paged<Assignment>>(`/assignments?${qs}`),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    Promise.all([api<Named[]>("/batches"), api<Named[]>("/subjects")]).then(([batches, subjects]) => {
      setLookups({ batches, subjects });
      setForm((f) => ({
        ...f,
        batchId: f.batchId || batches.find((b) => b.name.includes("JEE"))?.id || batches[0]?.id || "",
        subjectId: f.subjectId || subjects.find((s) => s.name === "Physics")?.id || subjects[0]?.id || "",
      }));
    }).catch(() => undefined);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const createdTitle = form.title;
    try {
      await api("/assignments", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          batchId: form.batchId,
          subjectId: form.subjectId,
          dueAt: form.dueAt,
        }),
      });
      setMsg("Assignment created");
      setForm((f) => ({ ...f, title: "", description: "" }));
      setQ(createdTitle);
      setPageIndex(0);
      await qc.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create assignment");
    }
  }

  return (
    <div>
      <div className="top">
        <h1>Assignments</h1>
      </div>
      {error ? <p className="err">{error}</p> : null}
      {msg ? <p className="hint">{msg}</p> : null}
      <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
        <div className="label">Create assignment</div>
        <label htmlFor="assignment-title">Title</label>
        <input id="assignment-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <label htmlFor="assignment-body">Description</label>
        <textarea id="assignment-body" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        <label htmlFor="assignment-batch">Batch</label>
        <select id="assignment-batch" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })} required>
          {lookups.batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="assignment-subject">Subject</label>
        <select id="assignment-subject" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
          {lookups.subjects.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="assignment-due">Due date</label>
        <input id="assignment-due" type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} required />
        <button className="btn" type="submit">Create assignment</button>
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
          searchPlaceholder="Search assignments"
          loading={query.isLoading}
          error={query.isError ? "Could not load assignments." : null}
          empty="No assignments match this search."
        />
      </div>
    </div>
  );
}
