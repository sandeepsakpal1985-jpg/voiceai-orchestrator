import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell, Notice } from "@/components/shell";
import { ReplyForm } from "@/components/reply-form";
import { requirePageActor } from "@/server/session";
import { ticketDetail } from "@/server/tickets";
import { listCategories, listMembers, listTags, listTeams } from "@/server/workspace";
import { formatInTimeZone } from "@/lib/time";
import { STATUS_MEANING } from "@/lib/ticket-rules";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const query = await searchParams;
  let detail;
  try {
    detail = await ticketDetail(actor, id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const [members, teams, categories, tags] = await Promise.all([listMembers(actor), listTeams(actor), listCategories(actor), listTags(actor)]);
  const ticket = detail.ticket;
  const lastInbound = [...detail.messages].reverse().find((message) => message.kind === "inbound");
  const to = Array.isArray(lastInbound?.from_email) ? "" : (lastInbound?.from_email ?? ticket.customer_email ?? "");
  return (
    <Shell actor={actor} current="/inbox">
      <div className="topbar">
        <div>
          <p className="muted"><Link href="/inbox">Inbox</Link></p>
          <h1>{ticket.reference}</h1>
          <p>{ticket.subject}</p>
        </div>
        <span className={`badge ${ticket.status}`}>{ticket.status.replaceAll("_", " ")}</span>
      </div>
      <Notice error={query.error} notice={query.notice} />
      {ticket.mailbox_provider === "mock" ? <p className="simulated">This ticket came from a simulated mailbox. Messages are not from a live Gmail or Microsoft 365 account.</p> : null}
      <p className="muted">{STATUS_MEANING[ticket.status]}</p>
      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <section className="stack">
          {detail.messages.map((message) => (
            <article key={String(message.id)} className={`message ${message.kind}`}>
              <p><strong>{message.kind === "internal_note" ? "Internal note" : message.kind === "outbound" ? "Reply" : "Customer"}</strong> · {formatInTimeZone(new Date(String(message.occurred_at)), actor.timezone)}</p>
              <p className="muted">{String(message.from_name ?? message.from_email ?? "System")} {message.delivery_status && message.kind === "outbound" ? `· ${message.delivery_status === "accepted" ? "Accepted by mailbox" : message.delivery_status}` : ""}</p>
              {message.body_html ? <div dangerouslySetInnerHTML={{ __html: String(message.body_html) }} /> : <p style={{ whiteSpace: "pre-wrap" }}>{String(message.body_text)}</p>}
              {message.send_error ? <p className="banner error">{String(message.send_error)}</p> : null}
            </article>
          ))}
          <section className="panel stack">
            <h2>Reply</h2>
            <ReplyForm ticketId={ticket.id} defaultTo={String(to)} defaultCc="" />
          </section>
          <form className="panel stack" action={`/api/tickets/${ticket.id}/notes`} method="post">
            <h2>Internal note</h2>
            <p className="muted">Notes stay inside KluMail. Mention a teammate with @email or @[user:id].</p>
            <textarea name="body" required />
            <button className="btn secondary" type="submit">Add note</button>
          </form>
        </section>
        <aside className="stack">
          <section className="panel stack">
            <p><Link href={`/customers/${ticket.customer_id}`}>{ticket.customer_name}</Link><br />{ticket.customer_email}</p>
            <form action={`/api/tickets/${ticket.id}/status`} method="post" className="stack">
              <label>Status
                <select name="status" defaultValue={ticket.status}>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label>Resolution note<textarea name="resolutionNote" defaultValue={ticket.resolution_note ?? ""} /></label>
              <button className="btn" type="submit">Update status</button>
            </form>
            <form action={`/api/tickets/${ticket.id}/fields`} method="post" className="stack">
              <label>Priority
                <select name="priority" defaultValue={ticket.priority}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label>Category
                <select name="categoryId" defaultValue={ticket.category_id ?? ""}>
                  <option value="">None</option>
                  {categories.filter((category) => !category.archived_at).map((category) => <option key={String(category.id)} value={String(category.id)}>{String(category.name)}</option>)}
                </select>
              </label>
              <button className="btn secondary" type="submit">Save fields</button>
            </form>
            <form action={`/api/tickets/${ticket.id}/assignment`} method="post" className="stack">
              <label>Team
                <select name="teamId" defaultValue={ticket.assigned_team_id ?? ""}>
                  <option value="">No team</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
              <label>Assignee
                <select name="assigneeId" defaultValue={ticket.assigned_user_id ?? ""}>
                  <option value="">Unassigned</option>
                  {members.filter((member) => member.status === "active").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
              <button className="btn" type="submit">Assign</button>
            </form>
          </section>
          <section className="panel">
            <h2>Tags</h2>
            {tags.filter((tag) => !tag.archived_at).map((tag) => (
              <form key={String(tag.id)} action={`/api/tickets/${ticket.id}/tags`} method="post" className="row">
                <input type="hidden" name="tagId" value={String(tag.id)} />
                <input type="hidden" name="enabled" value={detail.tags.some((item) => item.id === tag.id) ? "false" : "true"} />
                <button className="btn secondary" type="submit">{detail.tags.some((item) => item.id === tag.id) ? "Remove" : "Add"} {String(tag.name)}</button>
              </form>
            ))}
          </section>
          <section className="panel">
            <h2>Attachments</h2>
            {detail.attachments.length ? detail.attachments.map((file) => <p key={String(file.id)}><a href={`/api/attachments/${String(file.id)}`}>{String(file.filename)}</a></p>) : <p className="empty">No attachments.</p>}
          </section>
          {detail.duplicates.length ? <section className="panel"><h2>Possible duplicates</h2><p className="muted">Same customer and subject. This is a hint, not an automatic merge.</p>{detail.duplicates.map((item) => <p key={String(item.id)}><Link href={`/tickets/${String(item.id)}`}>{String(item.reference)}</Link></p>)}</section> : null}
          <section className="panel">
            <h2>Activity</h2>
            {detail.events.map((event) => <p key={String(event.id)}>{String(event.event_type).replaceAll("_", " ")} · {formatInTimeZone(new Date(String(event.created_at)), actor.timezone)}</p>)}
          </section>
        </aside>
      </div>
    </Shell>
  );
}
