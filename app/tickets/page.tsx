import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTickets } from "@/lib/guides-data";
import { getCurrentUser } from "@/lib/supabase/user";
import { TicketsTable } from "@/components/tickets-table";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import { isTicketWorkflowEnabled } from "@/lib/admin/flags";

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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Tickets</h1>
          <PushSubscribeButton />
        </div>
        <TicketsTable
          initialTickets={tickets}
          userId={user.id}
          workflowEnabled={isTicketWorkflowEnabled()}
        />
      </div>
    </section>
  );
}
