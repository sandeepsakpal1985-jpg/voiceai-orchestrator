import { useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const res = await auth.requestPasswordReset(email);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request");
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">
          Klu<span>Coach</span>
        </div>
        <h1>Reset password</h1>
        {error ? <div className="err">{error}</div> : null}
        {message ? <p data-testid="reset-generic">{message}</p> : null}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(ev) => setEmail(ev.target.value)} required />
        <button className="btn" type="submit">
          Send reset link
        </button>
        <p>
          <Link to="/login">Back to login</Link>
        </p>
      </form>
    </div>
  );
}
