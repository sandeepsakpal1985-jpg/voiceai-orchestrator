import { cookies } from "next/headers";
import { previewInvitation } from "@/server/workspace";
import { getSession } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await previewInvitation(token).catch(() => null);
  const jar = await cookies();
  const session = await getSession(jar.get("klumail_session")?.value);
  if (!preview) return <main className="auth-card panel"><h1>Invitation unavailable</h1></main>;
  return (
    <main className="auth-card panel stack" id="content">
      <h1>Join {preview.organizationName}</h1>
      <p>This invitation is for {preview.email} as {preview.role.replaceAll("_", " ")}.</p>
      {preview.expired ? <p className="banner error">This invitation has expired or was already used.</p> : null}
      {!session ? <p><a href={`/login`}>Sign in</a> or <a href={`/register`}>create an account</a> with {preview.email}, then open this page again.</p> : null}
      {session && !preview.expired ? (
        <form action="/api/invitations/accept" method="post">
          <input type="hidden" name="token" value={token} />
          <button className="btn" type="submit">Accept invitation</button>
        </form>
      ) : null}
    </main>
  );
}
