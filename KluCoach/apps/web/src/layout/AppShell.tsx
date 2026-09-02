import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Bell,
  Calendar,
  CalendarCheck,
  ClipboardList,
  Home,
  LayoutDashboard,
  Layers,
  LogOut,
  Upload,
  Users,
} from "lucide-react";
import { api, auth, setCsrf, type Me } from "../api";
import { useUnreadCount } from "../notifications/NotificationCenter";

export function AppShell() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const navigate = useNavigate();
  const unread = useUnreadCount(Boolean(me));
  const unreadCount = unread.data?.unreadCount ?? 0;

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
        <div className="brand">
          Klu<span>Coach</span>
        </div>
        <div className="hint" style={{ color: "#cfc3ad", padding: "8px 12px" }}>
          {me.institution?.name}
        </div>
        {role === "PARENT" && (
          <NavLink to="/parent">
            <Home size={16} aria-hidden /> Home
          </NavLink>
        )}
        {role === "STUDENT" && (
          <NavLink to="/student">
            <Home size={16} aria-hidden /> Home
          </NavLink>
        )}
        <NavLink to="/notifications" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}>
          <Bell size={16} aria-hidden /> Notifications
          {unreadCount ? <span className="badge">{unreadCount}</span> : null}
        </NavLink>
        {adminish && (
          <NavLink to="/admin">
            <LayoutDashboard size={16} aria-hidden /> Dashboard
          </NavLink>
        )}
        {adminish && (
          <NavLink to="/students">
            <Users size={16} aria-hidden /> Students
          </NavLink>
        )}
        {["INSTITUTION_ADMIN", "STAFF", "SUPER_ADMIN"].includes(role) && (
          <NavLink to="/parents">
            <Users size={16} aria-hidden /> Parents
          </NavLink>
        )}
        {["INSTITUTION_ADMIN", "STAFF", "SUPER_ADMIN"].includes(role) && (
          <NavLink to="/teachers">
            <Users size={16} aria-hidden /> Teachers
          </NavLink>
        )}
        {adminish && (
          <NavLink to="/batches">
            <Layers size={16} aria-hidden /> Batches
          </NavLink>
        )}
        {(adminish || role === "STUDENT" || role === "PARENT") && (
          <NavLink to="/attendance">
            <CalendarCheck size={16} aria-hidden /> Attendance
          </NavLink>
        )}
        {(adminish || role === "STUDENT" || role === "PARENT") && (
          <NavLink to="/assessments">
            <ClipboardList size={16} aria-hidden /> Tests
          </NavLink>
        )}
        <NavLink to="/timetable">
          <Calendar size={16} aria-hidden /> Timetable
        </NavLink>
        <NavLink to="/assignments">
          <BookOpen size={16} aria-hidden /> Assignments
        </NavLink>
        <NavLink to="/notices">
          <Bell size={16} aria-hidden /> Notices
        </NavLink>
        {role === "INSTITUTION_ADMIN" && (
          <NavLink to="/import">
            <Upload size={16} aria-hidden /> Import
          </NavLink>
        )}
        <button
          type="button"
          onClick={async () => {
            await api("/auth/logout", { method: "POST" });
            navigate("/login");
          }}
        >
          <LogOut size={16} aria-hidden /> Log out
        </button>
      </nav>
      <div className="main">
        <Outlet context={me} />
      </div>
    </div>
  );
}
