import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/user";
import {
  isTicketWorkflowEnabled,
  isUserPortalEnabled,
} from "@/lib/admin/flags";
import { createClient } from "@/lib/supabase/server";
import { TicketConversation } from "@/components/ticket-conversation";
import { getCitation } from "@/lib/knowledge/governance";
import { AttachmentLink } from "@/components/attachment-link";
import { TicketPortalActions } from "@/components/ticket-portal-actions";
import {
  describeTicketStatus,
  ticketReference,
} from "@/lib/tickets/user-status";
import { getIssueBySlug } from "@/lib/search";

type TicketDetail = {
  id: string;
  issue_title: string;
  message: string;
  status: string;
  platform: string | null;
  created_at: string;
  handoff_reason: string | null;
  resolver_type?: string | null;
  ai_recommended_issue_id?: string | null;
  diagnostic_answers?: unknown;
  attachment_path?: string | null;
  satisfaction_rating?: number | null;
  satisfaction_comment?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
};

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
  const portalEnabled = isUserPortalEnabled();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/tickets");
  const { ticketId } = await params;
  const supabase = await createClient();
  const ticketSelect = portalEnabled
    ? "id,issue_title,message,status,platform,created_at,handoff_reason,resolver_type,ai_recommended_issue_id,diagnostic_answers,attachment_path,satisfaction_rating,satisfaction_comment,resolved_at,closed_at,updated_at"
    : "id,issue_title,message,status,platform,created_at,handoff_reason,ai_recommended_issue_id";
  const { data: rawTicket } = await supabase
    .from("tickets")
    .select(ticketSelect)
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  const ticket = rawTicket as TicketDetail | null;
  if (!ticket) notFound();
  const citation = ticket.ai_recommended_issue_id
    ? await getCitation(ticket.ai_recommended_issue_id, null)
    : null;
  const { data: comments } = await supabase
    .from("ticket_comments")
    .select("id,message,author_type,created_at")
    .eq("ticket_id", ticketId)
    .eq("visibility", "public")
    .order("created_at", { ascending: true });
  const { data: events } = portalEnabled
    ? await supabase
        .from("ticket_system_events")
        .select("event_type,created_at,actor_type")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true })
    : { data: [] };
  const status = describeTicketStatus(ticket.status, {
    resolverType: ticket.resolver_type,
  });
  const recommendedIssue =
    portalEnabled && ticket.ai_recommended_issue_id
      ? getIssueBySlug(ticket.ai_recommended_issue_id)
      : null;
  const diagnosticAnswers = Array.isArray(ticket.diagnostic_answers)
    ? (ticket.diagnostic_answers as { questionId?: string; answer?: string }[])
    : [];
  const visibleDiagnosticAnswers = diagnosticAnswers.filter(
    (answer) =>
      Boolean(answer.questionId?.trim()) && Boolean(answer.answer?.trim())
  );
  const resolutionDate =
    ticket.closed_at ?? ticket.resolved_at ?? ticket.updated_at;
  const canReopen =
    portalEnabled &&
    ["resolved", "closed"].includes(ticket.status.toLowerCase()) &&
    Boolean(resolutionDate) &&
    new Date(resolutionDate as string).getTime() >=
      new Date().getTime() - 14 * 24 * 60 * 60 * 1000;
  const eventLabels: Record<string, string> = {
    "ticket.created": "Ticket submitted",
    "ai.assigned": "AI assistant took a look",
    "ai.solution_offered": "Suggested fix shared",
    "ai.escalated": "Sent to a support person",
    "employee.assigned": "A support person picked this up",
    "employee.claimed": "A support person picked this up",
    "comment.created": "New reply",
    "status.changed": "Status updated",
    "verification.requested": "Confirmation requested",
    "ticket.resolved": "Resolved",
    "ticket.closed": "Closed",
    "ticket.reopened": "Reopened",
    "ticket.rated": "Rated",
    "solution.rejected": "Marked as not working",
  };
  return (
    <section className="flex flex-1 flex-col px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <p className="font-mono text-sm text-muted-foreground">
          {portalEnabled ? ticketReference(ticket.id) : "Ticket"}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{ticket.issue_title}</h1>
        <div className="mt-3">
          <span
            className="glass-pill inline-block px-3 py-1 text-sm"
            title={ticket.status}
          >
            {portalEnabled ? status.label : ticket.status}
          </span>
          {portalEnabled && status.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {status.description}
            </p>
          )}
          {portalEnabled && status.attention && status.nextAction && (
            <p className="glass-pill mt-3 inline-block px-3 py-2 text-sm">
              {status.nextAction}
            </p>
          )}
        </div>
        {handoffReasonLabel(ticket.handoff_reason, ticket.status) && (
          <p className="mt-3 text-sm text-muted-foreground">
            Why a person is helping:{" "}
            {handoffReasonLabel(ticket.handoff_reason, ticket.status)}
          </p>
        )}
        {citation && (
          <p className="mt-3 text-sm text-muted-foreground">
            Source: {citation.title} · v{citation.version} · updated{" "}
            {citation.retrievedAt
              ? new Date(citation.retrievedAt).toLocaleDateString()
              : "unknown"}{" "}
            · {citation.supportedPlatforms.join(", ")}
          </p>
        )}
        <div className="glass-strong mt-6 p-5">
          <h2 className="font-semibold">Original problem</h2>
          <p className="mt-3 whitespace-pre-wrap">{ticket.message}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Platform: {ticket.platform ?? "Other"} · Created{" "}
            {new Date(ticket.created_at).toLocaleString()}
          </p>
          {portalEnabled && visibleDiagnosticAnswers.length > 0 && (
            <div className="mt-5">
              <h2 className="font-semibold">What you told us</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
                {visibleDiagnosticAnswers.map((answer) => (
                  <li key={answer.questionId}>
                    <span className="font-medium">{answer.questionId}:</span>{" "}
                    {answer.answer}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {portalEnabled && ticket.attachment_path && (
            <AttachmentLink path={ticket.attachment_path} />
          )}
        </div>
        {portalEnabled && (
          <>
            <TicketPortalActions
              ticketId={ticket.id}
              status={ticket.status}
              canReopen={canReopen}
              rating={ticket.satisfaction_rating ?? null}
              ratingComment={ticket.satisfaction_comment ?? null}
              recommendedIssue={
                recommendedIssue
                  ? { id: recommendedIssue.id, title: recommendedIssue.title }
                  : null
              }
            />
            <section className="glass mt-6 p-5">
              <h2 className="font-semibold">Activity</h2>
              <ol className="mt-4 space-y-3">
                {(events ?? [])
                  .filter((event) => eventLabels[event.event_type])
                  .map((event, index) => (
                    <li
                      key={`${event.created_at}-${index}`}
                      className="flex gap-3 text-sm"
                    >
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>
                        <span className="font-medium">
                          {eventLabels[event.event_type]}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </span>
                    </li>
                  ))}
              </ol>
            </section>
          </>
        )}
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
