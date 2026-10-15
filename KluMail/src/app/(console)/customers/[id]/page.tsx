import Link from "next/link";
import { Shell } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { getCustomer } from "@/server/tickets";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor();
  const { id } = await params;
  const data = await getCustomer(actor, id);
  return (
    <Shell actor={actor} current="/customers">
      <h1>{data.customer.display_name}</h1>
      <form className="row" action={`/api/customers/${id}`} method="post">
        <input name="displayName" defaultValue={data.customer.display_name} />
        <button className="btn secondary" type="submit">Rename</button>
      </form>
      <p>{data.emails.map((email) => email.email).join(", ")}</p>
      {data.similar.length ? <p className="simulated">Similar names exist and were not merged: {data.similar.map((item) => item.display_name).join(", ")}</p> : null}
      <h2>Tickets</h2>
      {data.tickets.map((ticket) => <p key={ticket.id}><Link href={`/tickets/${ticket.id}`}>{ticket.reference}</Link> {ticket.subject}</p>)}
    </Shell>
  );
}
