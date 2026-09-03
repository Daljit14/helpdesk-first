import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTickets } from "@/lib/guides-data";
import { getCurrentUser } from "@/lib/supabase/user";

export const metadata: Metadata = {
  title: "Tickets",
};

export default async function TicketsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/tickets");
  const tickets = await getTickets(user.id);

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight">Tickets</h1>
        {tickets.length === 0 ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-lg font-medium">
              You have not submitted any tickets.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block underline underline-offset-4"
            >
              Browse troubleshooting guides
            </Link>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-4 align-top">
                      <Link
                        href={`/issues/${ticket.issue_id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {ticket.issue_title}
                      </Link>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className="rounded-full bg-muted px-2 py-1 text-xs">
                        {ticket.status}
                      </span>
                    </td>
                    <td className="max-w-md whitespace-pre-wrap px-4 py-4 align-top">
                      {ticket.message}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 align-top text-muted-foreground">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
