import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { auth } from "../api";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await auth.completePasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">
          Klu<span>Coach</span>
        </div>
        <h1>Choose a new password</h1>
        {error ? <div className="err">{error}</div> : null}
        {done ? (
          <p data-testid="reset-complete">
            Password updated. <Link to="/login">Sign in</Link>
          </p>
        ) : (
          <>
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
            <button className="btn" type="submit">
              Update password
            </button>
          </>
        )}
      </form>
    </div>
  );
}
