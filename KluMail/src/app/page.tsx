import Link from "next/link";

export default function HomePage() {
  return (
    <main className="auth-card stack" id="content">
      <p className="brand" style={{ fontSize: "2.4rem" }}>Klu<span style={{ color: "#0c6b62" }}>Mail</span></p>
      <h1>The shared inbox for support teams.</h1>
      <p className="muted">Connect a mailbox, turn customer email into tickets, and keep every organization in its own workspace.</p>
      <div className="row">
        <Link className="btn" href="/register">Create an account</Link>
        <Link className="btn secondary" href="/login">Sign in</Link>
      </div>
    </main>
  );
}
