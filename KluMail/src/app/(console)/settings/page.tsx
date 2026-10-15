import { Shell, Notice } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { listCategories, listPreferences, listTags } from "@/server/workspace";
import { STATUS_MEANING } from "@/lib/ticket-rules";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const actor = await requirePageActor();
  const query = await searchParams;
  const [categories, tags, preferences] = await Promise.all([listCategories(actor), listTags(actor), listPreferences(actor)]);
  return (
    <Shell actor={actor} current="/settings">
      <h1>Organization settings</h1>
      <Notice notice={query.notice} error={query.error} />
      <form className="panel stack" action="/api/organizations/current" method="post">
        <label>Name<input name="name" defaultValue={actor.organizationName} required /></label>
        <label>Timezone<input name="timezone" defaultValue={actor.timezone} required /></label>
        <label>Default priority
          <select name="defaultPriority" defaultValue={actor.defaultPriority}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </label>
        <label>Default signature<textarea name="defaultSignature" defaultValue={actor.defaultSignature} /></label>
        <label>My signature<textarea name="emailSignature" defaultValue={actor.emailSignature} /></label>
        <button className="btn" type="submit">Save settings</button>
      </form>
      <form className="panel stack" action="/api/organizations/logo" method="post" encType="multipart/form-data">
        <label>Logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        <button className="btn secondary" type="submit">Upload logo</button>
      </form>
      <section className="panel">
        <h2>Statuses</h2>
        <p className="muted">Statuses are a fixed workflow so ticket history stays valid. They cannot be deleted.</p>
        {Object.entries(STATUS_MEANING).map(([status, meaning]) => <p key={status}><strong>{status.replaceAll("_", " ")}</strong> — {meaning}</p>)}
      </section>
      <section className="panel stack">
        <h2>Categories</h2>
        {categories.map((category) => <p key={String(category.id)}>{String(category.name)}{category.archived_at ? " (archived)" : ""}</p>)}
        <form className="row" action="/api/categories" method="post"><input name="name" required /><button className="btn secondary" type="submit">Add category</button></form>
      </section>
      <section className="panel stack">
        <h2>Tags</h2>
        {tags.map((tag) => <p key={String(tag.id)}>{String(tag.name)}{tag.archived_at ? " (archived)" : ""}</p>)}
        <form className="row" action="/api/tags" method="post"><input name="name" required /><button className="btn secondary" type="submit">Add tag</button></form>
      </section>
      <section className="panel">
        <h2>Notification preferences</h2>
        {["ticket_assigned", "ticket_reassigned", "customer_reply", "mention", "status_changed", "mailbox_connection_failed", "mailbox_sync_error"].map((eventType) => {
          const pref = preferences.find((item) => item.event_type === eventType);
          return (
            <form key={eventType} className="row" action="/api/preferences" method="post">
              <input type="hidden" name="eventType" value={eventType} />
              <span>{eventType.replaceAll("_", " ")}</span>
              <select name="inApp" defaultValue={pref?.in_app === false ? "false" : "true"}><option value="true">On</option><option value="false">Off</option></select>
              <button className="btn secondary" type="submit">Save</button>
            </form>
          );
        })}
      </section>
    </Shell>
  );
}
