export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <main className="auth-card panel stack" id="content">
      <h1>Choose a new password</h1>
      {query.error ? <p className="banner error" role="alert">{query.error}</p> : null}
      <form className="stack" action="/api/auth/reset-password" method="post">
        <input type="hidden" name="token" value={query.token ?? ""} />
        <label>New password<input name="password" type="password" required minLength={10} /></label>
        <button className="btn" type="submit">Update password</button>
      </form>
    </main>
  );
}
