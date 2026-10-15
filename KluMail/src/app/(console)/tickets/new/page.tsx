import { Shell } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { listTeams } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  const actor = await requirePageActor();
  const teams = await listTeams(actor);
  return (
    <Shell actor={actor} current="/inbox">
      <h1>New ticket</h1>
      <form className="panel stack" action="/api/tickets" method="post" style={{ maxWidth: 640 }}>
        <label>Subject<input name="subject" required /></label>
        <label>Customer email<input name="customerEmail" type="email" required /></label>
        <label>Customer name<input name="customerName" /></label>
        <label>Team
          <select name="teamId">{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
        </label>
        <label>Opening note<textarea name="body" required /></label>
        <button className="btn" type="submit">Create ticket</button>
      </form>
    </Shell>
  );
}
