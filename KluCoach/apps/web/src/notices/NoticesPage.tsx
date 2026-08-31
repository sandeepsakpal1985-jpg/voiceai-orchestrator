import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";

type Notice = { id: string; title: string; body: string; publishedAt: string };

export function NoticesPage() {
  const [rows, setRows] = useState<Notice[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => {
    api<Notice[]>("/notices").then(setRows).catch(() => undefined);
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    await api("/notices", { method: "POST", body: JSON.stringify({ title, body, audience: "INSTITUTION" }) });
    setTitle("");
    setBody("");
    setRows(await api("/notices"));
  }
  return (
    <div>
      <div className="top">
        <h1>Notices</h1>
      </div>
      <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
        <label htmlFor="notice-title">Title</label>
        <input id="notice-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label htmlFor="notice-body">Message</label>
        <textarea id="notice-body" value={body} onChange={(e) => setBody(e.target.value)} required rows={3} />
        <button className="btn" type="submit">Publish</button>
      </form>
      <div className="list">
        {rows.map((n) => (
          <div className="card" key={n.id}>
            <strong>{n.title}</strong>
            <p className="hint">{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
