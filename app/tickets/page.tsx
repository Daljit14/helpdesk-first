import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTickets } from "@/lib/guides-data";
import { getCurrentUser } from "@/lib/supabase/user";
import { TicketsTable } from "@/components/tickets-table";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import { isTicketWorkflowEnabled } from "@/lib/admin/flags";
import { isSecureAttachmentsEnabled } from "@/lib/admin/flags";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Tickets",
};

export default async function TicketsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/tickets");
  const tickets = await getTickets(user.id);
  const secureAttachmentsEnabled = isSecureAttachmentsEnabled();
  const attachmentCounts = new Map<string, number>();
  if (secureAttachmentsEnabled) {
    const supabase = await createClient();
    const { data: attachments } = await supabase
      .from("ticket_attachments")
      .select("ticket_id")
      .eq("uploader_id", user.id)
      .not("ticket_id", "is", null)
      .neq("status", "deleted");
    for (const attachment of attachments ?? []) {
      if (attachment.ticket_id) {
        attachmentCounts.set(
          attachment.ticket_id,
          (attachmentCounts.get(attachment.ticket_id) ?? 0) + 1
        );
      }
    }
  }
  const ticketsWithCounts = tickets.map((ticket) => ({
    ...ticket,
    attachmentCount: attachmentCounts.get(ticket.id) ?? 0,
  }));

  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="glass mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <h1 className="text-3xl font-bold tracking-tight">Tickets</h1>
          <PushSubscribeButton />
        </div>
        <TicketsTable
          initialTickets={ticketsWithCounts}
          userId={user.id}
          workflowEnabled={isTicketWorkflowEnabled()}
          secureAttachmentsEnabled={secureAttachmentsEnabled}
        />
      </div>
    </section>
  );
}
