export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  return (
    <main className="auth-card panel stack" id="content">
      <h1>Create your account</h1>
      {query.error ? <p className="banner error" role="alert">{query.error}</p> : null}
      <form className="stack" action="/api/auth/register" method="post">
        <label>Name<input name="name" required minLength={2} /></label>
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={10} /></label>
        <p className="muted">Use at least 10 characters with one letter and one number.</p>
        <button className="btn" type="submit">Create account</button>
      </form>
      <p><a href="/login">Already have an account?</a></p>
    </main>
  );
}
