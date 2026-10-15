import { Shell } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { canExport } from "@/lib/permissions";
import { recentRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; error?: string }> }) {
  const actor = await requirePageActor();
  const query = await searchParams;
  const range = recentRange(30, actor.timezone);
  const from = query.from || range.from;
  const to = query.to || range.to;
  return (
    <Shell actor={actor} current="/reports">
      <h1>Reports</h1>
      <p className="muted">Exports contain tickets you are allowed to see. Times are UTC. This report does not include SLA, FCR, or quality scores.</p>
      {query.error ? <p className="banner error">{query.error}</p> : null}
      {canExport(actor.role) ? (
        <form className="row" action="/api/reports/tickets.csv" method="get">
          <label>From<input type="date" name="from" defaultValue={from} /></label>
          <label>To<input type="date" name="to" defaultValue={to} /></label>
          <button className="btn" type="submit">Download CSV</button>
        </form>
      ) : <p>Agents can review their queue on the dashboard. CSV export is available to managers and administrators.</p>}
    </Shell>
  );
}
