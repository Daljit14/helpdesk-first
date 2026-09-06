import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/user";
import { isTicketWorkflowEnabled } from "@/lib/admin/flags";
import { createClient } from "@/lib/supabase/server";
import { TicketConversation } from "@/components/ticket-conversation";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  if (!isTicketWorkflowEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/tickets");
  const { ticketId } = await params;
  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id,issue_title,message,status,platform,created_at")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ticket) notFound();
  const { data: comments } = await supabase
    .from("ticket_comments")
    .select("id,message,author_type,created_at")
    .eq("ticket_id", ticketId)
    .eq("visibility", "public")
    .order("created_at", { ascending: true });
  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-muted-foreground">Ticket</p>
        <h1 className="mt-2 text-3xl font-bold">{ticket.issue_title}</h1>
        <p className="mt-3 rounded-full bg-muted px-3 py-1 text-sm inline-block">
          {ticket.status}
        </p>
        <div className="mt-6 rounded-xl border border-border p-5">
          <h2 className="font-semibold">Original problem</h2>
          <p className="mt-3 whitespace-pre-wrap">{ticket.message}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Platform: {ticket.platform ?? "Other"} · Created{" "}
            {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <TicketConversation
          ticketId={ticket.id}
          userId={user.id}
          initialComments={(comments ?? []) as never}
          status={ticket.status}
        />
      </div>
    </section>
  );
}
