import Link from "next/link";
import type { Actor } from "@/lib/types";
import { pageOrganizations } from "@/server/session";
import { unreadCount } from "@/server/insights";

const LINKS = [
  ["/dashboard", "Dashboard"],
  ["/inbox?view=mine", "My tickets"],
  ["/inbox?view=team", "Team inbox"],
  ["/inbox?view=unassigned", "Unassigned"],
  ["/inbox?view=all", "All tickets"],
  ["/customers", "Customers"],
  ["/reports", "Reports"],
  ["/notifications", "Notifications"],
  ["/users", "Users"],
  ["/teams", "Teams"],
  ["/mailboxes", "Mailboxes"],
  ["/settings", "Settings"],
  ["/profile", "Profile"],
] as const;

export async function Shell({ actor, children, current }: { actor: Actor; children: React.ReactNode; current: string }) {
  const [orgs, unread] = await Promise.all([pageOrganizations(actor.userId), unreadCount(actor)]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Klu<span>Mail</span></div>
        <form action="/api/organizations/switch" method="post">
          <label>
            Organization
            <select name="organizationId" defaultValue={actor.organizationId} aria-label="Organization">
              {orgs.filter((org) => org.status === "active").map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <button className="btn secondary" type="submit" style={{ marginTop: ".5rem" }}>Switch</button>
        </form>
        <nav className="nav" aria-label="Primary">
          {LINKS.filter(([href]) => {
            if (["/users", "/teams", "/mailboxes", "/settings"].includes(href)) return actor.role === "org_admin";
            if (href === "/inbox?view=all" || href === "/reports") return actor.role === "org_admin" || actor.role === "manager";
            return true;
          }).map(([href, label]) => (
            <Link key={href} href={href} aria-current={current === href.split("?")[0] ? "page" : undefined}>{label}{href === "/notifications" && unread ? ` (${unread})` : ""}</Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post"><button className="btn secondary" type="submit">Log out</button></form>
      </aside>
      <main className="main" id="content">{children}</main>
    </div>
  );
}

export function Notice({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className="banner error" role="alert">{error}</p>;
  if (notice) return <p className="banner" role="status">{notice}</p>;
  return null;
}
