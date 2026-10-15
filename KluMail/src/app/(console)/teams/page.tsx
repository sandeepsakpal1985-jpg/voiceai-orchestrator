import { Shell, Notice } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { listMembers, listTeams } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const actor = await requirePageActor();
  const query = await searchParams;
  const [teams, members] = await Promise.all([listTeams(actor), listMembers(actor)]);
  return (
    <Shell actor={actor} current="/teams">
      <h1>Teams</h1>
      <Notice notice={query.notice} error={query.error} />
      {actor.role === "org_admin" ? (
        <form className="panel row" action="/api/teams" method="post">
          <label>Name<input name="name" required /></label>
          <label>Description<input name="description" /></label>
          <button className="btn" type="submit">Create team</button>
        </form>
      ) : null}
      {teams.map((team) => (
        <article key={team.id} className="panel stack">
          <h2>{team.name}</h2>
          <p className="muted">{team.description}</p>
          <ul>{team.members.map((member) => <li key={member.user_id}>{member.name} · {member.email}</li>)}</ul>
          {actor.role === "org_admin" ? (
            <form className="row" action={`/api/teams/${team.id}/members`} method="post">
              <select name="userId">{members.filter((member) => member.status === "active").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
              <button className="btn secondary" type="submit">Add</button>
            </form>
          ) : null}
        </article>
      ))}
    </Shell>
  );
}
