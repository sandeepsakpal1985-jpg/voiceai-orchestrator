import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { DataTable } from "../ui/DataTable";
import { createAppColumnHelper, type SortingState } from "../ui/table-engine";
import { useDebounced } from "../lib/useDebounced";
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

type Branch = { id: string; name: string };
type Batch = { id: string; name: string };

export function StudentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedQ = useDebounced(q);
  const sort = sorting[0];
  const query = useStudentsQuery({
    q: debouncedQ,
    pageIndex,
    sort: sort?.id,
    dir: sort ? (sort.desc ? "desc" : "asc") : undefined,
    status: status || undefined,
  });

  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    admissionNumber: "",
    branchId: "",
    batchId: "",
    guardianName: "",
    guardianEmail: "",
  });
  const [formError, setFormError] = useState("");
  const [formMsg, setFormMsg] = useState("");

  async function loadLookups() {
    const [br, ba] = await Promise.all([api<Branch[]>("/branches"), api<Batch[]>("/batches")]);
    setBranches(br);
    setBatches(ba);
    setForm((f) => ({ ...f, branchId: f.branchId || br[0]?.id || "" }));
  }

  useEffect(() => {
    loadLookups().catch(() => undefined);
  }, []);

  async function createStudent(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormMsg("");
    try {
      await loadLookups();
      const created = await api<{ id: string }>("/students", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          admissionNumber: form.admissionNumber,
          branchId: form.branchId,
          batchId: form.batchId || undefined,
          guardians: form.guardianName
            ? [
                {
                  name: form.guardianName,
                  email: form.guardianEmail || undefined,
                  relationship: "GUARDIAN",
                  isPrimary: true,
                },
              ]
            : undefined,
        }),
      });
      setFormMsg("Student created");
      await qc.invalidateQueries({ queryKey: ["students"] });
      navigate(`/students/${created.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create student");
    }
  }

  async function archiveSelected(rows: StudentListRow[]) {
    await Promise.all(
      rows.map((row) =>
        api(`/students/${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "INACTIVE" }) }),
      ),
    );
    await qc.invalidateQueries({ queryKey: ["students"] });
  }

  return (
    <div>
      <div className="top">
        <h1>Students</h1>
      </div>
      <form className="card" onSubmit={createStudent} style={{ marginBottom: 16 }} onFocus={loadLookups}>
        <div className="label">Add student</div>
        {formError ? <p className="err">{formError}</p> : null}
        {formMsg ? <p className="hint">{formMsg}</p> : null}
        <div className="grid">
          <div>
            <label htmlFor="student-first-name">First name</label>
            <input id="student-first-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="student-last-name">Last name</label>
            <input id="student-last-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          </div>
        </div>
        <label htmlFor="student-admission">Admission number</label>
        <input id="student-admission" value={form.admissionNumber} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} required />
        <label htmlFor="student-branch">Branch</label>
        <select id="student-branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} required>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <label htmlFor="student-batch">Batch</label>
        <select id="student-batch" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
          <option value="">None</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <label htmlFor="guardian-name">Guardian name</label>
        <input id="guardian-name" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
        <label htmlFor="guardian-email">Guardian email</label>
        <input id="guardian-email" type="email" value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} />
        <button className="btn" type="submit">
          Create student
        </button>
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
          searchPlaceholder="Search students"
          filters={
            <select aria-label="Status filter" value={status} onChange={(e) => { setStatus(e.target.value); setPageIndex(0); }} style={{ maxWidth: 160 }}>
              <option value="">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          }
          loading={query.isLoading}
          error={query.isError ? "Could not load students." : null}
          empty="No students match this search."
          selectable
          bulkActions={(rows) => (
            <button type="button" className="btn secondary" onClick={() => archiveSelected(rows)}>
              Deactivate selected
            </button>
          )}
          onRowClick={(row) => navigate(`/students/${row.id}`)}
          rowActions={(row) => (
            <button type="button" className="btn secondary" onClick={() => navigate(`/students/${row.id}`)}>
              View
            </button>
          )}
        />
      </div>
    </div>
  );
}
