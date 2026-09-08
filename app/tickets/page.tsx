import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTickets } from "@/lib/guides-data";
import { getCurrentUser } from "@/lib/supabase/user";
import { TicketsTable } from "@/components/tickets-table";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import { NotificationPreferencesCard } from "@/components/notification-preferences";
import { getNotificationPreferences } from "@/app/actions/preferences";
import {
  isSecureAttachmentsEnabled,
  isTicketWorkflowEnabled,
  isUserPortalEnabled,
} from "@/lib/admin/flags";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Tickets",
};

export default async function TicketsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/tickets");
  const portalEnabled = isTicketWorkflowEnabled() && isUserPortalEnabled();
  const tickets = await getTickets(user.id, portalEnabled);
  const preferences = await getNotificationPreferences();
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
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tickets</h1>
            {portalEnabled && (
              <p className="mt-2 text-sm text-muted-foreground">
                Describe a problem once — track replies and confirm the fix
                here.
              </p>
            )}
          </div>
          <PushSubscribeButton />
        </div>
        {portalEnabled && (
          <Link
            href="/assistant"
            className="glass-pill mb-2 inline-block bg-primary px-5 py-2 text-primary-foreground"
          >
            New ticket
          </Link>
        )}
        {preferences && (
          <NotificationPreferencesCard
            userId={preferences.userId}
            emailEnabled={preferences.emailEnabled}
            pushEnabled={preferences.pushEnabled}
          />
        )}
        <div className="mt-6">
          <TicketsTable
            initialTickets={ticketsWithCounts}
            userId={user.id}
            secureAttachmentsEnabled={secureAttachmentsEnabled}
            portalEnabled={portalEnabled}
          />
        </div>
      </div>
    </section>
  );
}
