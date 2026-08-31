import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, setCsrf } from "../api";

export function LoginPage() {
  const [email, setEmail] = useState("parent@example.test");
  const [password, setPassword] = useState("DemoPassw0rd!");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await auth.login(email, password);
      setCsrf(res.csrfToken);
      if (res.user.role === "PARENT") navigate("/parent");
      else if (res.user.role === "STUDENT") navigate("/student");
      else if (res.user.role === "TEACHER") navigate("/attendance");
      else navigate("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">Klu<span>Coach</span></div>
        <p className="lede">Student 360 for coaching institutes. Parents see the journey in one place.</p>
        {error && <div className="err">{error}</div>}
        <label htmlFor="email">Email</label>
        <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <button className="btn" type="submit">Continue</button>
        <p className="hint">Demo: parent@example.test / admin@example.test / teacher@example.test — password DemoPassw0rd!</p>
      </form>
    </div>
  );
}
