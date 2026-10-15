import Link from "next/link";
import { Shell, Notice } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { listTickets } from "@/server/tickets";
import { parseTicketQuery } from "@/lib/filters";
import { formatInTimeZone } from "@/lib/time";
import { listTeams } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor();
  const raw = await searchParams;
  const flat = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") flat.set(key, value);
  }
  const query = parseTicketQuery(Object.fromEntries(flat.entries()));
  const [result, teams] = await Promise.all([listTickets(actor, query), listTeams(actor)]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <Shell actor={actor} current="/inbox">
      <div className="topbar">
        <div>
          <h1>Inbox</h1>
          <p className="muted">{result.total} tickets in this view</p>
        </div>
        <Link className="btn" href="/tickets/new">New ticket</Link>
      </div>
      <Notice error={typeof raw.error === "string" ? raw.error : undefined} notice={typeof raw.notice === "string" ? raw.notice : undefined} />
      <form className="panel grid" method="get" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <label>View
          <select name="view" defaultValue={query.view}>
            <option value="mine">My tickets</option>
            <option value="mine_open">My open tickets</option>
            <option value="mine_pending">My pending tickets</option>
            <option value="team">Team inbox</option>
            <option value="unassigned">Unassigned</option>
            <option value="all">All visible tickets</option>
            <option value="resolved_recent">Recently resolved</option>
            <option value="updated_recent">Recently updated</option>
          </select>
        </label>
        <label>Status
          <select name="status" defaultValue={query.status[0] ?? ""}>
            <option value="">Any</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>Priority
          <select name="priority" defaultValue={query.priority[0] ?? ""}>
            <option value="">Any</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>Team
          <select name="teamId" defaultValue={query.teamId ?? ""}>
            <option value="">Any</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label>Search<input name="q" defaultValue={query.q ?? ""} placeholder="Reference, subject, email" /></label>
        <label>From<input type="date" name="from" defaultValue={query.from ?? ""} /></label>
        <label>To<input type="date" name="to" defaultValue={query.to ?? ""} /></label>
        <label>Sort
          <select name="sort" defaultValue={query.sort}>
            <option value="last_activity_at">Last activity</option>
            <option value="created_at">Created</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
          </select>
        </label>
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="table-wrap panel" style={{ marginTop: "1rem" }}>
        <table>
          <thead><tr><th>Ticket</th><th>Customer</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Updated</th></tr></thead>
          <tbody>
            {result.items.length ? result.items.map((ticket) => (
              <tr key={ticket.id}>
                <td><Link href={`/tickets/${ticket.id}`}><strong>{ticket.reference}</strong><br />{ticket.subject}</Link>{ticket.mailbox_provider === "mock" ? <div className="simulated">Simulated mailbox</div> : null}</td>
                <td>{ticket.customer_name}<br /><span className="muted">{ticket.customer_email}</span></td>
                <td><span className={`badge ${ticket.status}`}>{ticket.status.replaceAll("_", " ")}</span></td>
                <td><span className={`badge ${ticket.priority}`}>{ticket.priority}</span></td>
                <td>{ticket.assignee_name ?? "Unassigned"}<br /><span className="muted">{ticket.team_name ?? ""}</span></td>
                <td>{formatInTimeZone(new Date(ticket.last_activity_at), actor.timezone)}</td>
              </tr>
            )) : <tr><td colSpan={6} className="empty">No tickets match this view.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="row" style={{ marginTop: "1rem" }}>
        {query.page > 1 ? <Link href={`/inbox?${new URLSearchParams({ ...Object.fromEntries(flat), page: String(query.page - 1) })}`}>Previous</Link> : null}
        <span>Page {query.page} of {pages}</span>
        {query.page < pages ? <Link href={`/inbox?${new URLSearchParams({ ...Object.fromEntries(flat), page: String(query.page + 1) })}`}>Next</Link> : null}
      </p>
    </Shell>
  );
}
