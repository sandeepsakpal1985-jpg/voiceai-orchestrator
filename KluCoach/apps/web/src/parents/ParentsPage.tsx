import { FormEvent, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { listQuery, type Paged } from "../lib/paged";
import { useDebounced } from "../lib/useDebounced";
import { DataTable } from "../ui/DataTable";
import { createAppColumnHelper, type SortingState } from "../ui/table-engine";

type Child = { student: { id: string; firstName: string; lastName: string; admissionNumber: string } };
type Invite = { acceptedAt: string | null; expiresAt: string };
type ParentRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  user: { id: string } | null;
  students: Child[];
  invitations: Invite[];
};

const helper = createAppColumnHelper<ParentRow>();
const columns = helper.columns([
  helper.accessor("name", { header: "Name" }),
  helper.accessor("email", { header: "Email" }),
  helper.accessor((row) => row.students.map((s) => s.student.firstName).join(", ") || "—", { id: "children", header: "Children" }),
  helper.accessor((row) => (row.user ? "Activated" : "Not activated"), { id: "activation", header: "Activation" }),
  helper.accessor((row) => {
    const latest = row.invitations[0];
    if (latest?.acceptedAt) return "Accepted";
    if (latest && new Date(latest.expiresAt) < new Date()) return "Expired";
    if (latest) return "Pending";
    return "Not invited";
  }, { id: "invite", header: "Invitation" }),
]);

const EMPTY: ParentRow[] = [];

export function ParentsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedQ = useDebounced(q);
  const sort = sorting[0];
  const qs = listQuery({
    pageIndex,
    q: debouncedQ,
    sort: sort?.id,
    dir: sort ? (sort.desc ? "desc" : "asc") : undefined,
  });
  const query = useQuery({
    queryKey: ["parents", qs],
    queryFn: () => api<Paged<ParentRow>>(`/parents?${qs}`),
    placeholderData: keepPreviousData,
  });
  const [selected, setSelected] = useState<ParentRow | null>(null);
  const [linkStudentId, setLinkStudentId] = useState("");
  const [msg, setMsg] = useState("");

  async function linkChild(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setMsg("");
    try {
      await api(`/parents/${selected.id}/children`, {
        method: "POST",
        body: JSON.stringify({ studentId: linkStudentId, relationship: "GUARDIAN" }),
      });
      setMsg("Child linked to this parent.");
      await qc.invalidateQueries({ queryKey: ["parents"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not link child");
    }
  }

  return (
    <div>
      <div className="top">
        <h1>Parents</h1>
      </div>
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
          searchPlaceholder="Search parents"
          loading={query.isLoading}
          error={query.isError ? "Could not load parents." : null}
          empty="No parents match this search."
          onRowClick={setSelected}
          rowActions={(row) => (
            <button type="button" className="btn secondary" onClick={() => setSelected(row)}>
              View
            </button>
          )}
        />
      </div>
      {selected ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="label">Parent</div>
          <h2 style={{ marginTop: 8 }}>
            {selected.name}
          </h2>
          <p className="hint">
            {selected.email ?? "No email"} · {selected.user ? "Activated" : "Not activated"}
          </p>
          <div className="label">Linked children</div>
          {selected.students.map((s) => (
            <div className="row" key={s.student.id}>
              <span>
                {s.student.firstName} {s.student.lastName}
              </span>
              <span className="hint">{s.student.admissionNumber}</span>
            </div>
          ))}
          <form onSubmit={linkChild} style={{ marginTop: 16 }}>
            <label htmlFor="link-student-id">Link additional student ID</label>
            <input id="link-student-id" value={linkStudentId} onChange={(e) => setLinkStudentId(e.target.value)} required />
            <button className="btn" type="submit">
              Link child
            </button>
            {msg ? <p className="hint">{msg}</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
