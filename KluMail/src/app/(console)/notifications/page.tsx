import Link from "next/link";
import { Shell } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { notificationsFor } from "@/server/insights";
import { formatInTimeZone } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const actor = await requirePageActor();
  const items = await notificationsFor(actor);
  return (
    <Shell actor={actor} current="/notifications">
      <div className="topbar"><h1>Notifications</h1><form action="/api/notifications" method="post"><button className="btn secondary" type="submit">Mark all read</button></form></div>
      {items.length ? items.map((item) => (
        <article key={String(item.id)} className="panel">
          <p><strong>{String(item.title)}</strong> {item.read_at ? "" : "· unread"}</p>
          <p className="muted">{formatInTimeZone(new Date(String(item.created_at)), actor.timezone)}</p>
          {item.ticket_id ? <Link href={`/tickets/${String(item.ticket_id)}`}>Open ticket</Link> : null}
          <form action="/api/notifications" method="post"><input type="hidden" name="id" value={String(item.id)} /><button className="btn secondary" type="submit">Mark read</button></form>
        </article>
      )) : <p className="empty">No notifications.</p>}
    </Shell>
  );
}
