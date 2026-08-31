import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, auth, setCsrf, type Me } from "../api";

export function AppShell() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    auth
      .me()
      .then((data) => {
        setMe(data);
        if (data.csrfToken) setCsrf(data.csrfToken);
        if (window.location.pathname === "/") {
          if (data.user.role === "PARENT") navigate("/parent", { replace: true });
          else if (data.user.role === "STUDENT") navigate("/student", { replace: true });
          else if (data.user.role === "TEACHER") navigate("/attendance", { replace: true });
          else navigate("/admin", { replace: true });
        }
      })
      .catch(() => setErr("unauth"));
  }, [navigate]);

  if (err === "unauth") {
    navigate("/login", { replace: true });
    return null;
  }
  if (!me) return <div className="main">Loading…</div>;

  const role = me.user.role;
  const adminish = ["INSTITUTION_ADMIN", "TEACHER", "STAFF", "SUPER_ADMIN"].includes(role);

  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">Klu<span>Coach</span></div>
        <div className="hint" style={{ color: "#cfc3ad", padding: "8px 12px" }}>
          {me.institution?.name}
        </div>
        {role === "PARENT" && <NavLink to="/parent">Home</NavLink>}
        {role === "STUDENT" && <NavLink to="/student">Home</NavLink>}
        {adminish && <NavLink to="/admin">Dashboard</NavLink>}
        {adminish && <NavLink to="/students">Students</NavLink>}
        {adminish && <NavLink to="/batches">Batches</NavLink>}
        {(adminish || role === "STUDENT" || role === "PARENT") && <NavLink to="/attendance">Attendance</NavLink>}
        {(adminish || role === "STUDENT" || role === "PARENT") && <NavLink to="/assessments">Tests</NavLink>}
        <NavLink to="/timetable">Timetable</NavLink>
        <NavLink to="/notices">Notices</NavLink>
        {role === "INSTITUTION_ADMIN" && <NavLink to="/import">Import</NavLink>}
        <button
          type="button"
          onClick={async () => {
            await api("/auth/logout", { method: "POST" });
            navigate("/login");
          }}
        >
          Log out
        </button>
      </nav>
      <div className="main">
        <Outlet context={me} />
      </div>
    </div>
  );
}
