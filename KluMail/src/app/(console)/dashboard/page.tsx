import { Shell, Notice } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { dashboard } from "@/server/insights";
import { recentRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; error?: string }> }) {
  const actor = await requirePageActor();
  const query = await searchParams;
  const range = recentRange(14, actor.timezone);
  const from = query.from || range.from;
  const to = query.to || range.to;
  const data = await dashboard(actor, from, to);
  const scope = actor.role === "org_admin" ? "Organization queue" : actor.role === "manager" ? "Team queue" : "My queue";
  return (
    <Shell actor={actor} current="/dashboard">
      <div className="topbar">
        <div>
          <h1>{scope}</h1>
          <p className="muted">{actor.organizationName} · {data.timezone} · Current backlog is separate from tickets created in the selected period.</p>
        </div>
      </div>
      <Notice error={query.error} />
      <form className="row" method="get">
        <label>From<input type="date" name="from" defaultValue={from} /></label>
        <label>To<input type="date" name="to" defaultValue={to} /></label>
        <button className="btn" type="submit">Apply</button>
      </form>
      <div className="cards" style={{ marginTop: "1rem" }}>
        {[
          ["Open", data.queue.open_count],
          ["In progress", data.queue.in_progress_count],
          ["Pending", data.queue.pending_count],
          ["Resolved", data.queue.resolved_count],
          ["Closed", data.queue.closed_count],
          ["Unassigned", data.queue.unassigned_count],
          [`Created ${from} to ${to}`, data.createdInPeriod],
        ].map(([label, value]) => (
          <article className="card" key={String(label)}><p className="muted">{label}</p><p className="kpi">{value}</p></article>
        ))}
      </div>
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Tickets created</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Day</th><th>Count</th></tr></thead>
            <tbody>
              {data.daily.length ? data.daily.map((day) => <tr key={day.day}><td>{day.day}</td><td>{day.count}</td></tr>) : <tr><td colSpan={2} className="empty">No tickets in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: "1rem" }}>
        <CountTable title="By priority" rows={data.byPriority.map((row) => ({ label: row.priority, count: row.count }))} />
        <CountTable title="By category" rows={data.byCategory.map((row) => ({ label: row.name, count: row.count }))} />
        <CountTable title="By team" rows={data.byTeam.map((row) => ({ label: row.name, count: row.count }))} />
        <CountTable title="By agent" rows={data.byAgent.map((row) => ({ label: row.name, count: row.count }))} />
      </div>
      {actor.role === "org_admin" ? (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <h2>Mailbox health</h2>
          <p className="muted">Failed sync jobs: {data.failedJobs}</p>
          {data.mailboxes.length ? (
            <table>
              <thead><tr><th>Mailbox</th><th>Provider</th><th>Status</th><th>Last success</th></tr></thead>
              <tbody>
                {data.mailboxes.map((box) => (
                  <tr key={String(box.id)}>
                    <td>{String(box.email_address)}{box.provider === "mock" ? " · Simulated" : ""}</td>
                    <td>{String(box.provider)}</td>
                    <td>{String(box.status)} / {String(box.sync_status)}{box.last_error ? ` — ${String(box.last_error)}` : ""}</td>
                    <td>{box.last_success_at ? new Date(String(box.last_success_at)).toISOString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">No mailboxes connected.</p>}
        </section>
      ) : null}
    </Shell>
  );
}

function CountTable({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {rows.length ? rows.map((row) => <p key={row.label} className="row" style={{ justifyContent: "space-between" }}><span>{row.label}</span><strong>{row.count}</strong></p>) : <p className="empty">No data.</p>}
    </section>
  );
}
