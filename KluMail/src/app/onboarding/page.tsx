import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const jar = await cookies();
  const session = await getSession(jar.get("klumail_session")?.value);
  if (!session) redirect("/login");
  const query = await searchParams;
  return (
    <main className="auth-card panel stack" id="content">
      <h1>Create your organization</h1>
      <p className="muted">This workspace keeps tickets, customers, and mailboxes separate from every other customer.</p>
      {query.error ? <p className="banner error" role="alert">{query.error}</p> : null}
      <form className="stack" action="/api/organizations" method="post">
        <label>Organization name<input name="name" required minLength={2} /></label>
        <label>Timezone<input name="timezone" defaultValue="UTC" required /></label>
        <button className="btn" type="submit">Create organization</button>
      </form>
    </main>
  );
}
