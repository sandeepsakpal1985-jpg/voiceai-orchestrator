import { FormEvent, useEffect, useState } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api, type Me } from "../api";
import { listQuery, type Paged } from "../lib/paged";
import { useDebounced } from "../lib/useDebounced";
import { DataTable } from "../ui/DataTable";
import { createAppColumnHelper, type SortingState } from "../ui/table-engine";

type Named = { id: string; name: string };
type Slot = {
  id: string;
  dayOfWeek: string;
  startMinute: number;
  endMinute: number;
  room: string | null;
  subject: Named;
  batch: Named;
  teacher?: Named | null;
};

function hhmm(min: number) {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  const date = setMinutes(setHours(new Date(2000, 0, 1), hours), minutes);
  return format(date, "h:mm a");
}

function fromTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const helper = createAppColumnHelper<Slot>();
const columns = helper.columns([
  helper.accessor("dayOfWeek", { header: "Day" }),
  helper.accessor((row) => `${hhmm(row.startMinute)}–${hhmm(row.endMinute)}`, { id: "time", header: "Time" }),
  helper.accessor((row) => row.subject.name, { id: "subject", header: "Subject" }),
  helper.accessor((row) => row.batch.name, { id: "batch", header: "Batch" }),
  helper.accessor((row) => row.room ?? "—", { id: "room", header: "Room" }),
]);

const EMPTY: Slot[] = [];
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export function TimetablePage() {
  const me = useOutletContext<Me>();
  const adminish = ["INSTITUTION_ADMIN", "TEACHER", "STAFF", "SUPER_ADMIN"].includes(me.user.role);
  if (adminish) return <AdminTimetable />;
  return <ScheduleView />;
}

function ScheduleView() {
  const [rows, setRows] = useState<Slot[]>([]);
  useEffect(() => {
    api<Slot[]>("/timetable").then(setRows).catch(() => undefined);
  }, []);
  return (
    <div>
      <div className="top">
        <h1>Timetable</h1>
      </div>
      {DAYS.map((d) => {
        const items = rows.filter((r) => r.dayOfWeek === d);
        if (!items.length) return null;
        return (
          <div className="card" key={d} style={{ marginBottom: 12 }}>
            <div className="label">{d}</div>
            {items.map((s) => (
              <div className="row" key={s.id}>
                <span>
                  {hhmm(s.startMinute)} {s.subject.name}
                </span>
                <span className="hint">
                  {s.batch.name}
                  {s.room ? ` · ${s.room}` : ""}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AdminTimetable() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedQ = useDebounced(q);
  const qs = listQuery({ pageIndex, q: debouncedQ });
  const query = useQuery({
    queryKey: ["timetable", qs],
    queryFn: () => api<Paged<Slot>>(`/timetable?${qs}`),
    placeholderData: keepPreviousData,
  });
  const [lookups, setLookups] = useState<{ batches: Named[]; subjects: Named[] }>({ batches: [], subjects: [] });
  const [form, setForm] = useState({
    batchId: "",
    subjectId: "",
    dayOfWeek: "FRIDAY",
    start: "17:00",
    end: "18:00",
    room: "R5",
  });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState<Slot | null>(null);
  const [editRoom, setEditRoom] = useState("");

  useEffect(() => {
    Promise.all([api<Named[]>("/batches"), api<Named[]>("/subjects")]).then(([batches, subjects]) => {
      setLookups({ batches, subjects });
      setForm((f) => ({
        ...f,
        batchId: f.batchId || batches.find((b) => b.name.includes("JEE"))?.id || batches[0]?.id || "",
        subjectId: f.subjectId || subjects[0]?.id || "",
      }));
    }).catch(() => undefined);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await api("/timetable", {
        method: "POST",
        body: JSON.stringify({
          batchId: form.batchId,
          subjectId: form.subjectId,
          dayOfWeek: form.dayOfWeek,
          startMinute: fromTime(form.start),
          endMinute: fromTime(form.end),
          room: form.room || undefined,
        }),
      });
      setMsg("Slot created");
      await qc.invalidateQueries({ queryKey: ["timetable"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create slot");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    await api(`/timetable/${edit.id}`, { method: "PATCH", body: JSON.stringify({ room: editRoom }) });
    setMsg("Slot updated");
    await qc.invalidateQueries({ queryKey: ["timetable"] });
  }

  return (
    <div>
      <div className="top">
        <h1>Timetable</h1>
      </div>
      <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
        <div className="label">Add slot</div>
        {error ? <p className="err">{error}</p> : null}
        {msg ? <p className="hint">{msg}</p> : null}
        <label htmlFor="slot-batch">Batch</label>
        <select id="slot-batch" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })} required>
          {lookups.batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="slot-subject">Subject</label>
        <select id="slot-subject" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
          {lookups.subjects.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label htmlFor="slot-day">Day</label>
        <select id="slot-day" value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
          {DAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <label htmlFor="slot-start">Start</label>
        <input id="slot-start" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
        <label htmlFor="slot-end">End</label>
        <input id="slot-end" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
        <label htmlFor="slot-room">Room</label>
        <input id="slot-room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
        <button className="btn" type="submit">Create slot</button>
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
          searchPlaceholder="Search timetable"
          loading={query.isLoading}
          error={query.isError ? "Could not load timetable." : null}
          empty="No timetable slots match this search."
          onRowClick={(row) => {
            setEdit(row);
            setEditRoom(row.room ?? "");
          }}
          rowActions={(row) => (
            <button type="button" className="btn secondary" onClick={() => { setEdit(row); setEditRoom(row.room ?? ""); }}>
              Edit
            </button>
          )}
        />
      </div>
      {edit ? (
        <form className="card" style={{ marginTop: 16 }} onSubmit={save}>
          <div className="label">Edit slot</div>
          <p className="hint">
            {edit.dayOfWeek} · {edit.subject.name} · {edit.batch.name}
          </p>
          <label htmlFor="edit-slot-room">Room</label>
          <input id="edit-slot-room" value={editRoom} onChange={(e) => setEditRoom(e.target.value)} />
          <button className="btn" type="submit">Save slot</button>
        </form>
      ) : null}
    </div>
  );
}
