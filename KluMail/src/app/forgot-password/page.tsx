export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <main className="auth-card panel stack" id="content">
      <h1>Reset password</h1>
      <p className="muted">If an account exists for the email, a reset link is sent. The response is the same either way.</p>
      {query.notice ? <p className="banner" role="status">{query.notice}</p> : null}
      {query.error ? <p className="banner error" role="alert">{query.error}</p> : null}
      <form className="stack" action="/api/auth/forgot-password" method="post">
        <label>Email<input name="email" type="email" required /></label>
        <button className="btn" type="submit">Send reset link</button>
      </form>
      {process.env.APP_ENV === "development" ? <p><a href="/dev/outbox">Open the local email outbox</a></p> : null}
    </main>
  );
}
