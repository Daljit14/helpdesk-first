import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, MessageSquare } from "lucide-react";
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
import {
  isEscalationPackageEnabled,
  isInvestigationEnabled,
  isResolutionTrackingEnabled,
  isSecureAttachmentsEnabled,
  isTicketWorkflowEnabled,
} from "@/lib/admin/flags";
import { getIssueBySlug } from "@/lib/search";
import { TicketWorkflowActions } from "@/components/admin/ticket-workflow-actions";
import { canAccessTicket } from "@/lib/admin/auth";
import { getCitation } from "@/lib/knowledge/governance";
import { getOrganizationPolicy } from "@/lib/admin/policies";
import { listAdminAttachments } from "@/app/actions/admin-attachments";
import { AttachmentList } from "@/components/attachment-list";
import { AdminAttachmentControls } from "@/components/admin/admin-attachment-controls";
import { ASSIGNABLE_ROLES, type AssignableRole } from "@/lib/org/roles";
import { TicketInvestigation } from "@/components/ticket-investigation";
import { loadInvestigation } from "@/lib/investigation/load";
import {
  buildEscalationPackage,
  type EscalationPackage,
} from "@/lib/investigation/escalation";
import { loadEscalationInputs } from "@/lib/investigation/escalation-load";
import { EscalationPackageCard } from "@/components/escalation-package";
import { formatHandoffReason } from "@/lib/tickets/routing";
import { isUiV2Enabled } from "@/lib/ui-v2";
import { AdminBreadcrumbs } from "@/components/admin/v2/breadcrumbs";

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
  email: string;
  role: AssignableRole;
};

function verificationExceptionDetails(report: unknown) {
  if (!report || typeof report !== "object") return null;
  const value = (report as { verificationException?: unknown })
    .verificationException;
  if (!value || typeof value !== "object") return null;
  const method = (value as { method?: unknown }).method;
  const reason = (value as { reason?: unknown }).reason;
  if (typeof method !== "string" || typeof reason !== "string") return null;
  return { method, reason };
}

function statusTone(status: string) {
  switch (status) {
    case "New":
    case "AI Reviewing":
    case "AI Resolving":
      return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200";
    case "Needs Human":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "In Progress":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-200";
    case "Waiting":
    case "Waiting for User":
      return "bg-violet-500/15 text-violet-800 dark:text-violet-200";
    case "Pending Verification":
      return "bg-teal-500/15 text-teal-800 dark:text-teal-200";
    case "Resolved":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "Closed":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function priorityTone(priority: string) {
  switch (priority) {
    case "Urgent":
      return "bg-red-500/15 text-red-800 dark:text-red-200";
    case "High":
      return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
    case "Low":
      return "bg-slate-500/15 text-slate-700 dark:text-slate-200";
    case "Normal":
    default:
      return "bg-muted text-muted-foreground";
  }
}

function TicketAccessDenied() {
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <div className="glass-strong w-full max-w-xl space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold">
            This ticket isn&apos;t in your organization or isn&apos;t assigned
            to you.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Return to the admin ticket list to view tickets available to your
            account.
          </p>
        </div>
        <Link
          href="/admin/tickets"
          className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Back to tickets
        </Link>
      </div>
    </section>
  );
}

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const session = await requireAdminPage(`/admin/tickets/${ticketId}`);
  const uiV2 = isUiV2Enabled();
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ticketId
    )
      ? ticketId
      : null;
  if (!uuid) notFound();

  const admin = createAdminClient();
  const workflowEnabled = isTicketWorkflowEnabled();
  const secureAttachmentsEnabled = isSecureAttachmentsEnabled();
  const organizationPolicy = await getOrganizationPolicy(
    session.organizationId
  );
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
  if (error || !ticket) return <TicketAccessDenied />;
  if (workflowEnabled && !canAccessTicket(session, ticket))
    return <TicketAccessDenied />;
  const exceptionDetails = verificationExceptionDetails(
    ticket.resolution_report
  );

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
        .select(
          "id,tool_name,tool_version,reason,parameters,approval_type,started_at,ended_at,verification_result,rollback_result,action_summary,result_summary,created_at"
        )
        .eq("organization_id", session.organizationId)
        .eq("ticket_id", uuid)
        .order("created_at", { ascending: true })
    : { data: [] };
  const workflowMembers: WorkflowMember[] = [];
  if (workflowEnabled && session.role === "org_admin") {
    const { data: memberRows } = await admin
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id", session.organizationId)
      .in("role", ASSIGNABLE_ROLES);
    const rows = (memberRows ?? []) as unknown as {
      user_id: string;
      role: AssignableRole;
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
      const userResult = await admin.auth.admin.getUserById(row.user_id);
      workflowMembers.push({
        userId: row.user_id,
        email:
          userResult.data.user?.email ?? names.get(row.user_id) ?? row.user_id,
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
  const citation = ticket.ai_recommended_issue_id
    ? await getCitation(ticket.ai_recommended_issue_id, session.organizationId)
    : null;
  const secureAttachments = secureAttachmentsEnabled
    ? await listAdminAttachments(uuid, session.organizationId)
    : [];
  const { data: stepOutcomes } = workflowEnabled
    ? await admin
        .from("ticket_step_outcomes")
        .select("guide_slug,step_index,outcome,created_at")
        .eq("organization_id", session.organizationId)
        .eq("ticket_id", uuid)
        .order("step_index", { ascending: true })
    : { data: [] };
  const investigation =
    isInvestigationEnabled() && workflowEnabled
      ? await loadInvestigation(admin, uuid)
      : null;
  const escalationEnabled = isEscalationPackageEnabled() && workflowEnabled;
  const shouldShowEscalation =
    escalationEnabled &&
    (["Needs Human", "In Progress", "Reopened"].includes(ticket.status) ||
      investigation?.investigation.status === "escalated");
  let escalationPackage: EscalationPackage | null = null;
  let escalationSnapshotAt: string | null = null;
  if (shouldShowEscalation) {
    escalationPackage = investigation?.investigation.escalation_package ?? null;
    escalationSnapshotAt =
      investigation?.investigation.escalation_package_at ?? null;
    if (!escalationPackage) {
      const inputs = await loadEscalationInputs(
        admin,
        uuid,
        session.organizationId
      );
      escalationPackage = inputs ? buildEscalationPackage(inputs) : null;
    }
    if (escalationPackage) {
      const sources = await Promise.all(
        escalationPackage.sources.map(async (source) => {
          const sourceCitation = await getCitation(
            source.guideSlug,
            session.organizationId
          );
          return sourceCitation
            ? {
                ...source,
                title: sourceCitation.title,
                url: sourceCitation.url,
              }
            : source;
        })
      );
      escalationPackage = { ...escalationPackage, sources };
    }
  }

  return (
    <section className="flex flex-1 flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        {uiV2 && (
          <AdminBreadcrumbs
            items={[
              { label: "Operations", href: "/admin/operations" },
              { label: "Ticket queue", href: "/admin/operations#tickets" },
              { label: toTicketId(ticket.id) },
            ]}
          />
        )}
        <p className="font-mono text-sm text-muted-foreground">
          {toTicketId(ticket.id)}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{ticket.issue_title}</h1>
        {uiV2 && (
          <nav
            aria-label="Ticket sections"
            className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-24 lg:z-10"
          >
            <ol className="flex min-w-max gap-4 text-sm lg:flex-wrap">
              {[
                ["User problem", "user-problem"],
                ["Device and platform", "device-platform"],
                ["Investigation and evidence", "investigation"],
                ["Diagnosis package", "diagnosis"],
                ["Likely causes and confidence", "classification"],
                ["Questions and answers", "questions"],
                ["Steps attempted and outcomes", "step-outcomes"],
                ["Withheld/restricted steps", "restricted-steps"],
                ["Public conversation", "public-conversation"],
                ["Internal notes", "internal-notes"],
                ["Attachments", "attachments"],
                ["Tools and actions used", "tools-actions"],
                ["Assignment and SLA", "assignment-sla"],
                ["Resolution and verification", "resolution"],
                ["Activity timeline", "timeline"],
              ].map(([label, id], index) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {index + 1}. {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div
          id={uiV2 ? "assignment-sla" : undefined}
          className="glass mt-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <p className="flex items-center gap-2">
            <span>Status:</span>
            <span
              className={`glass-pill px-2 py-1 text-xs ${statusTone(status)}`}
            >
              {status}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <span>Priority:</span>
            <span
              className={`glass-pill px-2 py-1 text-xs ${priorityTone(priority)}`}
            >
              {priority}
            </span>
          </p>
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
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <div id={uiV2 ? "user-problem" : undefined} className="glass p-5">
              <h2 className="font-semibold">Description</h2>
              <p className="mt-3 whitespace-pre-wrap text-muted-foreground">
                {ticket.message}
              </p>
              {!secureAttachmentsEnabled && attachmentUrl && (
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
            {secureAttachmentsEnabled &&
              (uiV2 ? (
                <div id="attachments">
                  <AttachmentList
                    attachments={secureAttachments}
                    adminControls={Object.fromEntries(
                      secureAttachments.map((attachment) => [
                        attachment.id,
                        <AdminAttachmentControls
                          key={`controls-${attachment.id}`}
                          attachment={attachment}
                        />,
                      ])
                    )}
                  />
                </div>
              ) : (
                <AttachmentList
                  attachments={secureAttachments}
                  adminControls={Object.fromEntries(
                    secureAttachments.map((attachment) => [
                      attachment.id,
                      <AdminAttachmentControls
                        key={`controls-${attachment.id}`}
                        attachment={attachment}
                      />,
                    ])
                  )}
                />
              ))}
            {workflowEnabled && (
              <>
                <div
                  id={uiV2 ? "classification" : undefined}
                  className="glass grid gap-4 p-5 sm:grid-cols-2"
                >
                  <h2 className="font-semibold sm:col-span-2">
                    AI classification
                  </h2>
                  <p>
                    Recommended guide: {ticket.ai_recommended_issue_id ?? "—"}
                  </p>
                  {citation && <p>Guide version: v{citation.version}</p>}
                  <p>Confidence: {ticket.ai_confidence ?? "—"}</p>
                  <p>Risk: {ticket.ai_risk_level ?? "—"}</p>
                  <p>
                    Handoff reason:{" "}
                    {formatHandoffReason(ticket.handoff_reason ?? null) ?? "—"}
                  </p>
                  <p>
                    AI attempts: {ticket.ai_failed_attempts ?? 0} failed of 2
                  </p>
                  <p>
                    Diagnostic questions asked: {ticket.ai_question_count ?? 0}
                  </p>
                  <p
                    id={uiV2 ? "questions" : undefined}
                    className="sm:col-span-2"
                  >
                    Diagnostic answers:{" "}
                    {Array.isArray(ticket.diagnostic_answers) &&
                    ticket.diagnostic_answers.length === 0
                      ? "None recorded"
                      : JSON.stringify(ticket.diagnostic_answers ?? [])}
                  </p>
                </div>
                {escalationPackage &&
                  (uiV2 ? (
                    <div id="diagnosis">
                      <EscalationPackageCard
                        pkg={escalationPackage}
                        snapshotAt={escalationSnapshotAt}
                      />
                    </div>
                  ) : (
                    <EscalationPackageCard
                      pkg={escalationPackage}
                      snapshotAt={escalationSnapshotAt}
                    />
                  ))}
                {investigation &&
                  (uiV2 ? (
                    <div id="investigation">
                      <TicketInvestigation
                        investigation={investigation.investigation}
                        turns={investigation.turns}
                      />
                    </div>
                  ) : (
                    <TicketInvestigation
                      investigation={investigation.investigation}
                      turns={investigation.turns}
                    />
                  ))}
                {uiV2 && (
                  <div id="restricted-steps" className="glass p-5">
                    <h2 className="font-semibold">Withheld/restricted steps</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      No restricted steps are recorded for this ticket.
                    </p>
                  </div>
                )}
                <div
                  id={uiV2 ? "step-outcomes" : undefined}
                  className="glass p-5"
                >
                  <h2 className="font-semibold">Step outcomes</h2>
                  <ul className="mt-3 space-y-2 text-sm">
                    {(stepOutcomes ?? []).length === 0 ? (
                      <li className="text-muted-foreground">
                        No outcomes recorded.
                      </li>
                    ) : (
                      (stepOutcomes ?? []).map((outcome) => (
                        <li key={`${outcome.guide_slug}-${outcome.step_index}`}>
                          Step {outcome.step_index + 1} → {outcome.outcome} ·{" "}
                          {new Date(outcome.created_at).toLocaleString()}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div
                  id={uiV2 ? "public-conversation" : undefined}
                  className="glass p-5"
                >
                  <h2
                    className={
                      uiV2
                        ? "flex items-center gap-2 font-semibold"
                        : "font-semibold"
                    }
                  >
                    {uiV2 && <MessageSquare className="h-4 w-4" aria-hidden />}
                    Conversation
                  </h2>
                  <div className="mt-3 space-y-3">
                    {(comments ?? [])
                      .filter((comment) => comment.visibility === "public")
                      .map((comment) => (
                        <p
                          key={comment.id}
                          className="rounded-2xl bg-muted/60 p-3"
                        >
                          <strong>{comment.author_type}:</strong>{" "}
                          {comment.message}
                        </p>
                      ))}
                  </div>
                </div>
                <div
                  id={uiV2 ? "internal-notes" : undefined}
                  className={`glass ${
                    uiV2
                      ? "border-dashed border-border bg-muted/30 p-5"
                      : "border-amber-500/30 bg-amber-500/10 p-5"
                  }`}
                  aria-describedby={
                    uiV2 ? "internal-notes-description" : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2
                      className={
                        uiV2
                          ? "flex items-center gap-2 font-semibold"
                          : "font-semibold"
                      }
                    >
                      {uiV2 && <Lock className="h-4 w-4" aria-hidden />}
                      Internal notes
                    </h2>
                    <span
                      className={
                        uiV2
                          ? "glass-pill px-3 py-1 text-xs"
                          : "glass-pill bg-amber-500/15 px-3 py-1 text-xs text-amber-800 dark:text-amber-200"
                      }
                    >
                      Private — staff only
                    </span>
                  </div>
                  <p
                    id={uiV2 ? "internal-notes-description" : undefined}
                    className={
                      uiV2
                        ? "mt-1 text-sm text-muted-foreground"
                        : "mt-1 text-sm text-amber-800 dark:text-amber-200"
                    }
                  >
                    Internal — not visible to user
                  </p>
                  <div className="mt-3 space-y-3">
                    {(comments ?? [])
                      .filter((comment) => comment.visibility === "internal")
                      .map((comment) => (
                        <p
                          key={comment.id}
                          className="rounded-2xl bg-amber-500/10 p-3"
                        >
                          {comment.message}
                        </p>
                      ))}
                  </div>
                </div>
                <div
                  id={uiV2 ? "tools-actions" : undefined}
                  className="glass p-5"
                >
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
                <div className="glass p-5">
                  <h2 className="font-semibold">Tools &amp; actions</h2>
                  <ul className="mt-3 space-y-2 text-sm">
                    {(actions ?? []).map((action) => (
                      <li key={action.id}>
                        <strong>{action.tool_name}</strong>
                        {action.tool_version ? ` v${action.tool_version}` : ""}
                        {action.approval_type
                          ? ` · approval: ${action.approval_type}`
                          : ""}
                        {action.verification_result
                          ? ` · verification: ${action.verification_result}`
                          : ""}
                        {action.rollback_result
                          ? ` · rollback: ${action.rollback_result}`
                          : ""}
                        {`: ${action.action_summary} — ${action.result_summary}`}
                        {action.reason ? ` · reason: ${action.reason}` : ""}
                        {action.parameters &&
                        Object.keys(action.parameters).length > 0
                          ? ` · parameters: ${JSON.stringify(action.parameters)}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            {resolutionTrackingEnabled && (
              <div id={uiV2 ? "resolution" : undefined} className="glass p-5">
                <h2 className="font-semibold">Resolution</h2>
                {exceptionDetails && (
                  <div className="glass-pill mt-3 inline-flex flex-col items-start gap-1 px-3 py-2 text-sm">
                    <strong>Verified by employee exception</strong>
                    <span>Method: {exceptionDetails.method}</span>
                    <span>Reason: {exceptionDetails.reason}</span>
                  </div>
                )}
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
            <div id={uiV2 ? "timeline" : undefined} className="glass p-5">
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
          <aside className="space-y-6 lg:sticky lg:top-24">
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
              <TicketWorkflowActions
                ticketId={uuid}
                canClaim={!ticket.assigned_agent_id}
                isAdmin={session.role === "org_admin"}
                members={workflowMembers}
                status={ticket.status}
                assignedAgentId={ticket.assigned_agent_id}
                allowVerificationException={
                  organizationPolicy.allowVerificationException
                }
              />
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
