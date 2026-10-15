import { listDevelopmentEmails } from "@/server/auth";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const host = (await headers()).get("host") ?? "";
  if (process.env.APP_ENV !== "development" || (!host.startsWith("localhost") && !host.startsWith("127.0.0.1"))) notFound();
  const emails = await listDevelopmentEmails();
  return (
    <main className="main stack" id="content">
      <h1>Local email outbox</h1>
      <p className="simulated">Development only. These messages are not delivered to a real inbox unless SMTP is configured.</p>
      {emails.map((email) => (
        <article key={email.created_at.toISOString() + email.subject} className="panel">
          <p><strong>{email.subject}</strong> to {email.recipient_email}</p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{email.body_text}</pre>
        </article>
      ))}
    </main>
  );
}
