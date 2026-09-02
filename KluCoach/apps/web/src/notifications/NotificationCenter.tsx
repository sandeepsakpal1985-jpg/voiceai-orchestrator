import { formatDistanceToNow } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  studentId: string | null;
  studentName: string | null;
  readAt: string | null;
  createdAt: string;
};

type List = { items: NotificationItem[]; total: number; unreadCount: number; page: number; pageSize: number };

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api<{ unreadCount: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
    enabled,
  });
}

export function NotificationCenter() {
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get("unread") === "1";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ["notifications", "list", unreadOnly],
    queryFn: () => api<List>(`/notifications?page=1&pageSize=30${unreadOnly ? "&unread=1" : ""}`),
  });

  async function openItem(row: NotificationItem) {
    if (!row.readAt) {
      await api(`/notifications/${row.id}/read`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    navigate(row.href || "/");
  }

  async function markAll() {
    await api("/notifications/read-all", { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div>
      <div className="top">
        <h1>Notifications</h1>
        <button className="btn secondary" type="button" onClick={markAll}>
          Mark all read
        </button>
      </div>
      <div className="child-pills" role="tablist" aria-label="Notification filter">
        <button type="button" className={unreadOnly ? "pill" : "pill on"} aria-selected={!unreadOnly} onClick={() => setParams({})}>
          All
        </button>
        <button type="button" className={unreadOnly ? "pill on" : "pill"} aria-selected={unreadOnly} onClick={() => setParams({ unread: "1" })}>
          Unread
        </button>
      </div>
      {list.isError ? <p className="err">Could not load notifications</p> : null}
      {list.data?.items.length === 0 ? <p className="hint">No notifications yet.</p> : null}
      <div className="list">
        {list.data?.items.map((row) => (
          <button
            type="button"
            className={row.readAt ? "card notify-item" : "card notify-item unread"}
            key={row.id}
            onClick={() => openItem(row)}
          >
            <strong>{row.title}</strong>
            <p className="hint">{row.body}</p>
            <p className="hint">
              {row.studentName ? `${row.studentName} · ` : ""}
              {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
              {row.readAt ? "" : " · Unread"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RecentNotifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => api<List>("/notifications?page=1&pageSize=3"),
  });
  if (!list.data?.items.length) return null;
  return (
    <section className="card" style={{ marginBottom: 16 }} aria-labelledby="recent-activity-heading">
      <h2 id="recent-activity-heading" className="label">
        Recent activity
      </h2>
      {list.data.items.map((row) => (
        <button
          type="button"
          className="row notify-row"
          key={row.id}
          aria-label={row.title}
          onClick={async () => {
            if (!row.readAt) {
              await api(`/notifications/${row.id}/read`, { method: "POST" });
              await queryClient.invalidateQueries({ queryKey: ["notifications"] });
            }
            navigate(row.href || "/");
          }}
        >
          <span>{row.title}</span>
          <span className="hint">{row.studentName ?? ""}</span>
        </button>
      ))}
    </section>
  );
}
