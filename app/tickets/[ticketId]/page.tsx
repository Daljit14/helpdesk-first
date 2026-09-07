import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/user";
import { isTicketWorkflowEnabled } from "@/lib/admin/flags";
import { createClient } from "@/lib/supabase/server";
import { TicketConversation } from "@/components/ticket-conversation";

export const dynamic = "force-dynamic";

function handoffReasonLabel(
  reason: string | null,
  status: string
): string | null {
  if (
    !["needs human", "in progress", "waiting for user"].includes(
      status.toLowerCase()
    )
  )
    return null;
  const labels: Record<string, string> = {
    admin_access_required: "This needs administrator access",
    credentials: "This involves passwords or sign-in security",
    credentials_involved: "This involves passwords or sign-in security",
    malware: "This may involve a security concern",
    unauthorized_access: "This may involve a security concern",
    security_concern: "This may involve a security concern",
    hardware: "This may need hardware repair",
    hardware_repair: "This may need hardware repair",
    remote_assistance: "This may need remote assistance",
    remote_assistance_required: "This may need remote assistance",
    low_confidence: "No approved self-service guide matched",
    no_guide: "No approved self-service guide matched",
    no_approved_guide: "No approved self-service guide matched",
    repeated_failure: "The suggested steps did not fix it",
    user_requested_human: "You asked for a person",
    too_many_questions: "More detail is needed from a person",
    insufficient_diagnostics: "More detail is needed from a person",
  };
  return reason ? (labels[reason] ?? null) : null;
}

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
    .select("id,issue_title,message,status,platform,created_at,handoff_reason")
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
        <p className="glass-pill mt-3 inline-block px-3 py-1 text-sm">
          {ticket.status}
        </p>
        {handoffReasonLabel(ticket.handoff_reason, ticket.status) && (
          <p className="mt-3 text-sm text-muted-foreground">
            Why a person is helping:{" "}
            {handoffReasonLabel(ticket.handoff_reason, ticket.status)}
          </p>
        )}
        <div className="glass-strong mt-6 p-5">
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
