import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/supabase/user";
import {
  isTicketWorkflowEnabled,
  isUserPortalEnabled,
  isInvestigationEnabled,
} from "@/lib/admin/flags";
import { getAdminSession } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveTicketRedirect } from "@/lib/tickets/access-redirect";
import { TicketConversation } from "@/components/ticket-conversation";
import { getCitation } from "@/lib/knowledge/governance";
import { AttachmentList } from "@/components/attachment-list";
import { listOwnAttachments } from "@/lib/attachments/server";
import { AttachmentLink } from "@/components/attachment-link";
import { TicketPortalActions } from "@/components/ticket-portal-actions";
import { TicketStepOutcomes } from "@/components/ticket-step-outcomes";
import {
  describeTicketAssignment,
  describeTicketStatus,
  ticketReference,
} from "@/lib/tickets/user-status";
import { getIssueBySlug } from "@/lib/search";
import { getIssueSteps } from "@/lib/steps";
import { TicketProgress } from "@/components/ticket-progress";
import { TicketInvestigation } from "@/components/ticket-investigation";
import { loadInvestigation } from "@/lib/investigation/load";
import {
  Bot,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Send,
  UserCheck,
} from "lucide-react";

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
  assigned_agent_id?: string | null;
  human_response_due_at?: string | null;
  first_human_response_at?: string | null;
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

function relativeTime(value: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function TicketUnavailable({
  email,
  ticketId,
}: {
  email: string;
  ticketId: string;
}) {
  const adminLoginPath = `/admin/login?next=${encodeURIComponent(
    `/admin/tickets/${ticketId}`
  )}`;

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <div className="glass-strong w-full max-w-xl space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold">
            This ticket isn&apos;t available for this account
          </h1>
          <p className="mt-3 text-muted-foreground">
            You&apos;re signed in as <strong>{email}</strong>. Open the link
            with the account that submitted the ticket, or sign in as a support
            person.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/tickets"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            My tickets
          </Link>
          <Link
            href={adminLoginPath}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium"
          >
            Sign in as support
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-full border border-border px-4 py-2 text-sm font-medium"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const workflowEnabled = isTicketWorkflowEnabled();
  const portalEnabled = workflowEnabled && isUserPortalEnabled();
  const user = await getCurrentUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/tickets/${ticketId}`)}`);
  const supabase = await createClient();
  const ticketSelect = portalEnabled
    ? "id,issue_title,message,status,platform,created_at,handoff_reason,resolver_type,ai_recommended_issue_id,diagnostic_answers,attachment_path,satisfaction_rating,satisfaction_comment,resolved_at,closed_at,updated_at,assigned_agent_id,human_response_due_at,first_human_response_at"
    : "id,issue_title,message,status,platform,created_at,handoff_reason,ai_recommended_issue_id";
  const { data: rawTicket } = await supabase
    .from("tickets")
    .select(ticketSelect)
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  const ticket = rawTicket as TicketDetail | null;
  if (!ticket) {
    const adminSession = await getAdminSession();
    const { data: accessTicket } = await createAdminClient()
      .from("tickets")
      .select("id,organization_id")
      .eq("id", ticketId)
      .maybeSingle();
    const access = resolveTicketRedirect({
      ownsTicket: false,
      adminSession,
      ticketOrgId: accessTicket?.organization_id,
      ticketId,
    });
    if (access.kind === "admin") redirect(access.href);
    return (
      <TicketUnavailable
        email={user.email ?? "this account"}
        ticketId={ticketId}
      />
    );
  }
  const investigation =
    isInvestigationEnabled() && portalEnabled
      ? await loadInvestigation(supabase, ticketId)
      : null;
  const citation = ticket.ai_recommended_issue_id
    ? await getCitation(ticket.ai_recommended_issue_id, null)
    : null;
  const { data: comments } = await supabase
    .from("ticket_comments")
    .select("id,message,author_type,created_at")
    .eq("ticket_id", ticketId)
    .eq("visibility", "public")
    .order("created_at", { ascending: true });
  const attachments = await listOwnAttachments(ticketId);
  const { data: events } = portalEnabled
    ? await supabase
        .from("ticket_system_events")
        .select("event_type,created_at,actor_type,detail")
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
  const stepOutcomes = recommendedIssue
    ? await supabase
        .from("ticket_step_outcomes")
        .select("step_index,outcome")
        .eq("ticket_id", ticketId)
        .eq("guide_slug", recommendedIssue.id)
    : { data: [] };
  const outcomes = Object.fromEntries(
    (stepOutcomes.data ?? []).map((row) => [row.step_index, row.outcome])
  ) as Record<number, "worked" | "failed" | "could_not_perform">;
  const assignment = describeTicketAssignment({
    assignedAgentId: ticket.assigned_agent_id,
    humanResponseDueAt: ticket.human_response_due_at,
    status: ticket.status,
    updatedAt: ticket.updated_at,
  });
  const showStepOutcomes =
    portalEnabled &&
    recommendedIssue &&
    ["ai resolving", "waiting for user", "needs human", "in progress"].includes(
      ticket.status.toLowerCase()
    );
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
  const eventIcon = (eventType: string) => {
    if (eventType === "ticket.created") return Send;
    if (eventType.startsWith("ai.")) return Bot;
    if (eventType.includes("assigned") || eventType.includes("claimed"))
      return UserCheck;
    if (eventType === "comment.created") return MessageSquare;
    if (eventType === "status.changed") return RefreshCw;
    if (eventType.includes("resolved") || eventType.includes("verified"))
      return CheckCircle2;
    if (eventType.includes("reopened")) return RotateCcw;
    return RefreshCw;
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
        <TicketProgress
          status={ticket.status}
          description={status.description}
          assignment={assignment}
        />
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
        <AttachmentList attachments={attachments} />
        {investigation && (
          <TicketInvestigation
            investigation={investigation.investigation}
            turns={investigation.turns}
          />
        )}
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
            {showStepOutcomes && recommendedIssue && (
              <TicketStepOutcomes
                ticketId={ticket.id}
                guideSlug={recommendedIssue.id}
                guideTitle={recommendedIssue.title}
                guideUrl={`/issues/${recommendedIssue.id}/guide`}
                steps={getIssueSteps(recommendedIssue)}
                outcomes={outcomes}
              />
            )}
            <section className="glass mt-6 p-5">
              <h2 className="font-semibold">Activity timeline</h2>
              <ol className="mt-4 space-y-3">
                {(events ?? [])
                  .filter((event) => eventLabels[event.event_type])
                  .map((event, index) => (
                    <li
                      key={`${event.created_at}-${index}`}
                      className="flex gap-3 text-sm"
                    >
                      {(() => {
                        const Icon = eventIcon(event.event_type);
                        return (
                          <span className="relative shrink-0">
                            <span className="absolute left-3 top-7 h-full w-px bg-border" />
                            <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Icon className="h-4 w-4" />
                            </span>
                          </span>
                        );
                      })()}
                      <span>
                        <span className="font-medium">
                          {(() => {
                            if (event.event_type !== "comment.created")
                              return eventLabels[event.event_type];
                            return event.actor_type === "employee"
                              ? "Support replied"
                              : event.actor_type === "ai"
                                ? "Assistant replied"
                                : "You replied";
                          })()}
                        </span>
                        <span
                          className="ml-2 text-muted-foreground"
                          title={new Date(event.created_at).toLocaleString()}
                        >
                          {relativeTime(event.created_at)}
                        </span>
                        {(event.detail as { preview?: string } | null)
                          ?.preview && (
                          <span className="mt-1 block text-muted-foreground">
                            {(event.detail as { preview: string }).preview}
                          </span>
                        )}
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
          workflowEnabled={workflowEnabled}
        />
      </div>
    </section>
  );
}
