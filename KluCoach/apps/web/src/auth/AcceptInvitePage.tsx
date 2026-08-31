import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth, setCsrf } from "../api";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const res = (await auth.acceptInvite(token, password, firstName, lastName)) as { csrfToken: string; user: { role: string } };
      setCsrf(res.csrfToken);
      navigate(res.user.role === "PARENT" ? "/parent" : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">Join Klu<span>Coach</span></div>
        <p className="lede">Create your password to see your child’s coaching journey.</p>
        {error && <div className="err">{error}</div>}
        <label>First name</label>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <label>Last name</label>
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
        <button className="btn" type="submit">Activate</button>
      </form>
    </div>
  );
}
