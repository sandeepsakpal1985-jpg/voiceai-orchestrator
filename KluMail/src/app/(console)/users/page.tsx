import { Shell, Notice } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { listMembers, listTeams } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; invite?: string }> }) {
  const actor = await requirePageActor();
  const query = await searchParams;
  const [members, teams] = await Promise.all([listMembers(actor), listTeams(actor)]);
  return (
    <Shell actor={actor} current="/users">
      <h1>People</h1>
      <Notice notice={query.notice} error={query.error} />
      {query.invite ? <p className="banner">Invitation link: {query.invite}</p> : null}
      {actor.role === "org_admin" ? (
        <form className="panel stack" action="/api/invitations" method="post">
          <label>Email<input name="email" type="email" required /></label>
          <label>Role
            <select name="role"><option value="agent">Agent</option><option value="manager">Manager</option><option value="org_admin">Administrator</option></select>
          </label>
          <label>Team
            <select name="teamId"><option value="">None</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
          </label>
          <button className="btn" type="submit">Invite</button>
        </form>
      ) : null}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>{member.name}</td><td>{member.email}</td><td>{member.role.replaceAll("_", " ")}</td><td>{member.status}</td>
              <td>{actor.role === "org_admin" && member.id !== actor.userId ? (
                <form action={`/api/members/${member.id}`} method="post" className="row">
                  <select name="role" defaultValue={member.role}><option value="agent">Agent</option><option value="manager">Manager</option><option value="org_admin">Administrator</option></select>
                  <select name="status" defaultValue={member.status}><option value="active">Active</option><option value="disabled">Disabled</option></select>
                  <button className="btn secondary" type="submit">Save</button>
                </form>
              ) : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
