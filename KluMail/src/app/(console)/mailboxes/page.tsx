import { Shell, Notice } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { listMailboxes } from "@/server/mailboxes";
import { listTeams } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function MailboxesPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; mailbox?: string }> }) {
  const actor = await requirePageActor();
  const query = await searchParams;
  const [mailboxes, teams] = await Promise.all([listMailboxes(actor), listTeams(actor)]);
  return (
    <Shell actor={actor} current="/mailboxes">
      <h1>Mailboxes</h1>
      <Notice notice={query.notice} error={query.error} />
      <p className="muted">Gmail and Microsoft 365 use OAuth. A simulated mailbox is available in development and is labeled everywhere it appears.</p>
      {actor.role === "org_admin" ? (
        <form className="panel stack" action="/api/mailboxes/connect" method="post">
          <label>Provider
            <select name="provider" defaultValue="mock">
              <option value="mock">Simulated mailbox</option>
              <option value="gmail">Gmail</option>
              <option value="microsoft">Microsoft 365</option>
            </select>
          </label>
          <label>Team
            <select name="teamId" required>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
          </label>
          <label>Mailbox address<input name="email" type="email" placeholder="support@example.com" /></label>
          <button className="btn" type="submit">Connect mailbox</button>
        </form>
      ) : <p>Only an organization administrator can connect mailboxes.</p>}
      <div className="stack" style={{ marginTop: "1rem" }}>
        {mailboxes.map((box) => (
          <article key={String(box.id)} className="panel">
            <h2>{String(box.email_address)}</h2>
            {box.provider === "mock" ? <p className="simulated">Simulated development mailbox. Not a live provider.</p> : null}
            <p>Status: {String(box.status)} · Sync: {String(box.sync_status)}</p>
            <p className="muted">Last success: {box.last_success_at ? new Date(String(box.last_success_at)).toISOString() : "Never"}{box.last_error ? ` · ${String(box.last_error)}` : ""}</p>
            {actor.role === "org_admin" ? (
              <div className="row">
                <form action={`/api/mailboxes/${String(box.id)}/sync`} method="post"><button className="btn" type="submit">Sync now</button></form>
                <form action={`/api/mailboxes/${String(box.id)}/disconnect`} method="post"><button className="btn danger" type="submit">Disconnect</button></form>
              </div>
            ) : null}
            {box.provider === "mock" && actor.role === "org_admin" ? (
              <form className="stack" action={`/api/mailboxes/${String(box.id)}/mock-messages`} method="post">
                <h3>Inject a simulated customer email</h3>
                <label>From<input name="fromEmail" type="email" required /></label>
                <label>Name<input name="fromName" /></label>
                <label>Subject<input name="subject" required /></label>
                <label>Body<textarea name="body" required /></label>
                <button className="btn secondary" type="submit">Inject and sync</button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </Shell>
  );
}
