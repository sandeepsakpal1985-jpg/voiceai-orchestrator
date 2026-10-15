export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const query = await searchParams;
  return (
    <main className="auth-card panel stack" id="content">
      <h1>Verify email</h1>
      <form action="/api/auth/verify-email" method="post">
        <input type="hidden" name="token" value={query.token ?? ""} />
        <button className="btn" type="submit">Confirm email address</button>
      </form>
    </main>
  );
}
