import Link from "next/link";
import { Shell } from "@/components/shell";
import { requirePageActor } from "@/server/session";
import { searchCustomers } from "@/server/tickets";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePageActor();
  const query = await searchParams;
  const customers = query.q ? await searchCustomers(actor, query.q) : [];
  return (
    <Shell actor={actor} current="/customers">
      <h1>Customers</h1>
      <form className="row" method="get"><label>Search<input name="q" defaultValue={query.q ?? ""} /></label><button className="btn" type="submit">Search</button></form>
      {!query.q ? <p className="empty">Search by name or email. Similar names are not merged automatically.</p> : null}
      <div className="panel" style={{ marginTop: "1rem" }}>
        {customers.map((customer) => <p key={`${customer.id}-${customer.email}`}><Link href={`/customers/${customer.id}`}>{customer.display_name}</Link> · {customer.email}</p>)}
      </div>
    </Shell>
  );
}
