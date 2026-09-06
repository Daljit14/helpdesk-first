import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TicketUpdateForm } from "@/components/admin/ticket-update-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit, requireAdminPage } from "@/lib/admin/auth";
import {
  categoryLabel,
  normalizePlatform,
  normalizePriority,
  normalizeStatus,
  slaDue,
  toTicketId,
} from "@/lib/operations/transform";
import { isResolutionTrackingEnabled } from "@/lib/admin/flags";
import { getIssueBySlug } from "@/lib/search";
import { TicketWorkflowActions } from "@/components/admin/ticket-workflow-actions";
import { canAccessTicket } from "@/lib/admin/auth";
import { isTicketWorkflowEnabled } from "@/lib/admin/flags";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ticket detail",
  robots: { index: false, follow: false },
};

type TicketPageRow = {
  [key: string]: unknown;
  id: string;
  organization_id: string;
  user_id: string;
  issue_id: string;
  issue_title: string;
  category: string | null;
  status: string;
  priority: string;
  assigned_agent: string | null;
  assigned_agent_id?: string | null;
  platform: string | null;
  created_at: string;
  updated_at: string | null;
  first_response_at: string | null;
  first_human_response_at?: string | null;
  human_response_due_at?: string | null;
  resolved_at: string | null;
  closed_at?: string | null;
  attachment_path: string | null;
  message: string;
  resolution_source: string | null;
  ai_attempted: boolean;
  ai_attempted_at: string | null;
  ai_failed_attempts?: number | null;
  ai_question_count?: number | null;
  ai_recommended_issue_id: string | null;
  ai_confidence?: number | null;
  ai_risk_level?: string | null;
  handoff_reason?: string | null;
  diagnostic_answers?: unknown;
  resolution_report?: unknown;
  escalated: boolean;
  escalated_at: string | null;
  escalation_reason: string | null;
  resolution_summary: string | null;
  user_confirmed: boolean;
  user_confirmed_at: string | null;
};

type WorkflowMember = {
  userId: string;
  displayName: string;
  role: "admin" | "support_agent";
};

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const session = await requireAdminPage(`/admin/tickets/${ticketId}`);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ticketId
    )
      ? ticketId
      : null;
  if (!uuid) notFound();

  const admin = createAdminClient();
  const workflowEnabled = isTicketWorkflowEnabled();
  const ticketResult = await (
    workflowEnabled
      ? admin
          .from("tickets")
          .select(
            "id, organization_id, user_id, issue_id, issue_title, category, status, priority, assigned_agent, assigned_agent_id, platform, created_at, updated_at, first_response_at, first_human_response_at, human_response_due_at, resolved_at, closed_at, attachment_path, message, resolution_source, ai_attempted, ai_attempted_at, ai_failed_attempts, ai_question_count, ai_recommended_issue_id, ai_confidence, ai_risk_level, handoff_reason, diagnostic_answers, resolution_report, escalated, escalated_at, escalation_reason, resolution_summary, user_confirmed, user_confirmed_at"
          )
      : admin
          .from("tickets")
          .select(
            "id, organization_id, user_id, issue_id, issue_title, category, status, priority, assigned_agent, platform, created_at, updated_at, first_response_at, resolved_at, attachment_path, message, resolution_source, ai_attempted, ai_attempted_at, ai_recommended_issue_id, escalated, escalated_at, escalation_reason, resolution_summary, user_confirmed, user_confirmed_at"
          )
  )
    .eq("organization_id", session.organizationId)
    .eq("id", uuid)
    .maybeSingle();
  const { data: rawTicket, error } = ticketResult as unknown as {
    data: TicketPageRow | null;
    error: Error | null;
  };
  const ticket = rawTicket;
  if (error || !ticket) notFound();
  if (workflowEnabled && !canAccessTicket(session, ticket)) notFound();

  const { data: events } = await admin
    .from("ticket_events")
    .select("event_type, from_value, to_value, created_at")
    .eq("organization_id", session.organizationId)
    .eq("ticket_id", uuid)
    .order("created_at", { ascending: true });
  const { data: workflowEvents } = workflowEnabled
    ? await admin
        .from("ticket_system_events")
        .select("id,event_type,actor_type,detail,created_at")
        .eq("organization_id", session.organizationId)
        .eq("ticket_id", uuid)
        .order("created_at", { ascending: true })
    : { data: [] };
  const { data: comments } = workflowEnabled
    ? await admin
        .from("ticket_comments")
        .select("id,message,visibility,author_type,created_at")
        .eq("organization_id", session.organizationId)
        .eq("ticket_id", uuid)
        .order("created_at", { ascending: true })
    : { data: [] };
  const { data: actions } = workflowEnabled
    ? await admin
        .from("ticket_actions")
        .select("id,tool_name,action_summary,result_summary,created_at")
        .eq("organization_id", session.organizationId)
        .eq("ticket_id", uuid)
        .order("created_at", { ascending: true })
    : { data: [] };
  const workflowMembers: WorkflowMember[] = [];
  if (workflowEnabled && session.role === "admin") {
    const { data: memberRows } = await admin
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id", session.organizationId)
      .in("role", ["admin", "support_agent"]);
    const rows = (memberRows ?? []) as unknown as {
      user_id: string;
      role: "admin" | "support_agent";
    }[];
    const profiles = await admin
      .from("admin_profiles")
      .select("user_id,display_name")
      .in(
        "user_id",
        rows.map((row) => row.user_id)
      );
    const names = new Map(
      (
        (profiles.data ?? []) as unknown as {
          user_id: string;
          display_name: string | null;
        }[]
      ).map((profile) => [profile.user_id, profile.display_name])
    );
    for (const row of rows) {
      workflowMembers.push({
        userId: row.user_id,
        displayName: names.get(row.user_id) ?? row.user_id,
        role: row.role,
      });
    }
  }
  let attachmentUrl: string | null = null;
  if (ticket.attachment_path) {
    const signed = await admin.storage
      .from("ticket-attachments")
      .createSignedUrl(ticket.attachment_path, 60);
    attachmentUrl = signed.data?.signedUrl ?? null;
  }
  await recordAudit(session, "ticket.view_detail", uuid);
  const status = workflowEnabled
    ? ticket.status
    : normalizeStatus(ticket.status);
  const priority = normalizePriority(ticket.priority);
  const due = slaDue(ticket.created_at, priority);
  const resolutionTrackingEnabled = isResolutionTrackingEnabled();
  const recommendedIssue = ticket.ai_recommended_issue_id
    ? getIssueBySlug(ticket.ai_recommended_issue_id)
    : null;

  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <p className="font-mono text-sm text-muted-foreground">
          {toTicketId(ticket.id)}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{ticket.issue_title}</h1>
        <div className="glass mt-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <p>Status: {status}</p>
          <p>Priority: {priority}</p>
          <p>Category: {ticket.category ?? categoryLabel(ticket.issue_id)}</p>
          <p>Platform: {normalizePlatform(ticket.platform)}</p>
          <p>Agent: {ticket.assigned_agent ?? "Unassigned"}</p>
          <p>SLA due: {new Date(due).toLocaleString()}</p>
          <p>Created: {new Date(ticket.created_at).toLocaleString()}</p>
          <p>
            Updated:{" "}
            {new Date(ticket.updated_at ?? ticket.created_at).toLocaleString()}
          </p>
        </div>
        <TicketUpdateForm
          ticketId={uuid}
          status={status}
          priority={priority}
          assignedAgent={ticket.assigned_agent ?? ""}
          resolutionTrackingEnabled={resolutionTrackingEnabled}
          resolutionSummary={ticket.resolution_summary ?? ""}
          workflowEnabled={workflowEnabled}
        />
        {workflowEnabled && (
          <>
            <div className="glass mt-6 grid gap-4 p-5 sm:grid-cols-2">
              <h2 className="font-semibold sm:col-span-2">AI classification</h2>
              <p>Recommended guide: {ticket.ai_recommended_issue_id ?? "—"}</p>
              <p>Confidence: {ticket.ai_confidence ?? "—"}</p>
              <p>Risk: {ticket.ai_risk_level ?? "—"}</p>
              <p>Handoff reason: {ticket.handoff_reason ?? "—"}</p>
              <p>AI attempts: {ticket.ai_failed_attempts ?? 0} failed of 2</p>
              <p>Diagnostic questions asked: {ticket.ai_question_count ?? 0}</p>
              <p className="sm:col-span-2">
                Diagnostic answers:{" "}
                {Array.isArray(ticket.diagnostic_answers) &&
                ticket.diagnostic_answers.length === 0
                  ? "None recorded"
                  : JSON.stringify(ticket.diagnostic_answers ?? [])}
              </p>
            </div>
            <div className="glass mt-6 p-5">
              <h2 className="font-semibold">Conversation</h2>
              <div className="mt-3 space-y-3">
                {(comments ?? [])
                  .filter((comment) => comment.visibility === "public")
                  .map((comment) => (
                    <p key={comment.id} className="rounded-2xl bg-muted/60 p-3">
                      <strong>{comment.author_type}:</strong> {comment.message}
                    </p>
                  ))}
              </div>
            </div>
            <div className="glass mt-6 border-amber-500/30 bg-amber-500/10 p-5">
              <h2 className="font-semibold">Internal notes</h2>
              <p className="mt-1 text-sm">Internal — not visible to user</p>
              <div className="mt-3 space-y-3">
                {(comments ?? [])
                  .filter((comment) => comment.visibility === "internal")
                  .map((comment) => (
                    <p key={comment.id} className="rounded-2xl bg-amber-500/10 p-3">
                      {comment.message}
                    </p>
                  ))}
              </div>
            </div>
            <div className="glass mt-6 p-5">
              <h2 className="font-semibold">System activity</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(workflowEvents ?? []).map((event) => (
                  <li key={event.id}>
                    {event.event_type} ·{" "}
                    {new Date(event.created_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass mt-6 p-5">
              <h2 className="font-semibold">Tools &amp; actions</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(actions ?? []).map((action) => (
                  <li key={action.id}>
                    {action.tool_name}: {action.action_summary} —{" "}
                    {action.result_summary}
                  </li>
                ))}
              </ul>
            </div>
            <TicketWorkflowActions
              ticketId={uuid}
              canClaim={!ticket.assigned_agent_id}
              isAdmin={session.role === "admin"}
              members={workflowMembers}
              status={ticket.status}
              assignedAgentId={ticket.assigned_agent_id}
            />
          </>
        )}
        {resolutionTrackingEnabled && (
          <div className="glass mt-6 p-5">
            <h2 className="font-semibold">Resolution</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">Resolved by</dt>
                <dd>
                  {ticket.resolution_source === "ai"
                    ? "AI assistant"
                    : ticket.resolution_source === "agent" ||
                        ticket.resolution_source === "employee"
                      ? "Support agent"
                      : ticket.resolution_source === "self_service"
                        ? "Self-service"
                        : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">AI attempted</dt>
                <dd>
                  {ticket.ai_attempted ? "Yes" : "No"}
                  {ticket.ai_attempted_at
                    ? ` · ${new Date(ticket.ai_attempted_at).toLocaleString()}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Recommended guide</dt>
                <dd>{recommendedIssue?.title ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium">Escalated</dt>
                <dd>
                  {ticket.escalated ? "Yes" : "No"}
                  {ticket.escalated_at
                    ? ` · ${new Date(ticket.escalated_at).toLocaleString()}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Escalation reason</dt>
                <dd>{ticket.escalation_reason ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium">User confirmed</dt>
                <dd>
                  {ticket.user_confirmed && ticket.user_confirmed_at
                    ? new Date(ticket.user_confirmed_at).toLocaleString()
                    : "Not confirmed"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium">Resolution summary</dt>
                <dd>{ticket.resolution_summary ?? "—"}</dd>
              </div>
            </dl>
          </div>
        )}
        <div className="glass mt-6 p-5">
          <h2 className="font-semibold">Description</h2>
          <p className="mt-3 whitespace-pre-wrap text-muted-foreground">
            {ticket.message}
          </p>
          {attachmentUrl && (
            <a
              href={attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block underline underline-offset-4"
            >
              Open attachment (link valid 60 s)
            </a>
          )}
        </div>
        <div className="glass mt-6 p-5">
          <h2 className="font-semibold">Timeline</h2>
          <ol className="mt-4 space-y-3">
            {(events ?? []).map((event, index) => (
              <li key={`${event.created_at}-${index}`} className="text-sm">
                <span className="font-medium">{event.event_type}</span>
                <span className="ml-2 text-muted-foreground">
                  {event.from_value ? `${event.from_value} → ` : ""}
                  {event.to_value ?? ""}
                  {" · "}
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
