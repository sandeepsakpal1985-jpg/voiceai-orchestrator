export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  return (
    <main className="auth-card panel stack" id="content">
      <h1>Sign in</h1>
      {query.error ? <p className="banner error" role="alert">{query.error}</p> : null}
      {query.notice ? <p className="banner" role="status">{query.notice}</p> : null}
      <form className="stack" action="/api/auth/login" method="post">
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn" type="submit">Sign in</button>
      </form>
      <p><a href="/forgot-password">Forgot password</a> · <a href="/register">Create an account</a></p>
    </main>
  );
}
