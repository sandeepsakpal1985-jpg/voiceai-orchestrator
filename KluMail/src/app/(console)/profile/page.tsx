import { Shell, Notice } from "@/components/shell";
import { requirePageActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const actor = await requirePageActor();
  const query = await searchParams;
  return (
    <Shell actor={actor} current="/profile">
      <h1>Profile</h1>
      <Notice notice={query.notice} error={query.error} />
      <p>{actor.email} · {actor.emailVerified ? "Email verified" : "Email not verified"} · {actor.role.replaceAll("_", " ")}</p>
      <form className="panel stack" action="/api/profile" method="post">
        <label>Name<input name="name" defaultValue={actor.name} required /></label>
        <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" /></label>
        <label>New password<input name="newPassword" type="password" autoComplete="new-password" /></label>
        <button className="btn" type="submit">Save profile</button>
      </form>
    </Shell>
  );
}
