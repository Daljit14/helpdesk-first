import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  History,
  Laptop,
  Lock,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Ticket,
  Timer,
  UserRound,
} from "lucide-react";
import {
  AdminHero,
  AdminPage,
  EmptyState,
  HeroChip,
  Panel,
  StatusPill,
  heroButton,
  type StatTone,
} from "@/components/admin/ui/admin-kit";
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
import { NO_REQUESTER, toUserText } from "@/lib/agent/output-guard";
import { isUiV2Enabled } from "@/lib/ui-v2";
import { AdminBreadcrumbs } from "@/components/admin/v2/breadcrumbs";
import {
  decryptCommentRows,
  decryptAgentText,
  decryptTicketRow,
} from "@/lib/security/ticket-crypto";
import { RecordExclusionControl } from "@/components/admin/record-exclusion-control";
import { isRecordExcluded } from "@/lib/admin/record-exclusions";
import { trustLabel } from "@/lib/research/labels";
import type { TrustTier } from "@/lib/research/types";
import { CallerVerificationPanel } from "@/components/admin/caller-verification-panel";
import { isStaffVerificationEnabled } from "@/lib/admin/flags";
import { loadCallerDirectoryFacts } from "@/lib/identity/risk-server";
import { loadStaffVerification } from "@/lib/identity/staff-verification";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ticket detail",
  robots: { index: false, follow: false },
};

const agentStepLabels: Record<string, string> = {
  session_consent_offered: "Session autorun consent offered",
  session_consent_granted: "Session autorun consent granted",
  session_consent_revoked: "Session autorun consent revoked",
  action_autorun: "Action applied automatically",
  action_shadowed: "Action shadowed for review",
  tier_demoted: "Autonomy tier demoted",
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

/** Aurora tone for a ticket status (matches the admin ticket queue). */
function statusTone(status: string): StatTone {
  switch (status) {
    case "New":
    case "AI Reviewing":
    case "AI Resolving":
      return "primary";
    case "Needs Human":
    case "Reopened":
      return "warn";
    case "In Progress":
    case "Pending Verification":
      return "info";
    case "Resolved":
      return "good";
    case "Waiting":
    case "Waiting for User":
    case "Closed":
    default:
      return "neutral";
  }
}

function priorityTone(priority: string): StatTone {
  switch (priority) {
    case "Urgent":
      return "danger";
    case "High":
      return "warn";
    default:
      return "neutral";
  }
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString();
}

function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

type SlaSnapshot = {
  state: "Breached" | "Due <1h" | "On track" | "Met" | "Missed";
  tone: StatTone;
  countdown: string;
  progress: number;
};

/**
 * SLA state for the ticket. Lives outside the component so the clock read
 * stays out of render (React purity lint).
 */
function slaSnapshot(
  createdAt: string,
  due: string,
  status: string,
  finishedAt: string | null
): SlaSnapshot {
  const created = Date.parse(createdAt);
  const dueAt = Date.parse(due);
  const done = status === "Resolved" || status === "Closed";
  const end = done && finishedAt ? Date.parse(finishedAt) : Date.now();
  const remaining = dueAt - end;
  const progress = Math.min(
    1,
    Math.max(0, (end - created) / Math.max(1, dueAt - created))
  );
  if (done) {
    return remaining >= 0
      ? {
          state: "Met",
          tone: "good",
          countdown: "Resolved within SLA",
          progress,
        }
      : {
          state: "Missed",
          tone: "danger",
          countdown: `Resolved ${formatDuration(remaining)} late`,
          progress,
        };
  }
  if (remaining < 0)
    return {
      state: "Breached",
      tone: "danger",
      countdown: `Overdue by ${formatDuration(remaining)}`,
      progress,
    };
  if (remaining < 60 * 60 * 1000)
    return {
      state: "Due <1h",
      tone: "warn",
      countdown: `${formatDuration(remaining)} left`,
      progress,
    };
  return {
    state: "On track",
    tone: "good",
    countdown: `${formatDuration(remaining)} left`,
    progress,
  };
}

const SLA_BAR: Record<StatTone, string> = {
  primary: "hf-adm-bar",
  good: "bg-status-success",
  warn: "bg-status-warning",
  danger: "bg-status-danger",
  info: "bg-status-info",
  neutral: "bg-muted-foreground",
};

/** Wrapper for self-styled child cards: drops their own top margin. */
const embedClass = "hf-rise min-w-0 [&>*]:mt-0!";

/** Vertical animated timeline (dot + connecting line). */
function TimelineList({
  items,
  empty,
}: {
  items: {
    key: string;
    title: ReactNode;
    detail?: ReactNode;
    when: string;
    tone?: StatTone;
  }[];
  empty: string;
}) {
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  const dot: Record<StatTone, string> = {
    primary: "bg-primary",
    good: "bg-status-success",
    warn: "bg-status-warning",
    danger: "bg-status-danger",
    info: "bg-status-info",
    neutral: "bg-muted-foreground",
  };
  return (
    <ol className="relative">
      {items.map((item, index) => (
        <li
          key={item.key}
          className="hf-rise relative flex gap-3 pb-5 text-sm last:pb-0"
          style={{ animationDelay: `${0.05 + Math.min(index, 12) * 0.05}s` }}
        >
          {index < items.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[7px] top-4 h-full w-px bg-border"
            />
          )}
          <span
            aria-hidden
            className="relative mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-card ring-2 ring-border"
          >
            <span
              className={`h-[7px] w-[7px] rounded-full ${dot[item.tone ?? "primary"]}`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">{item.title}</p>
            {item.detail && (
              <p className="mt-0.5 break-words text-muted-foreground">
                {item.detail}
              </p>
            )}
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
              {formatWhen(item.when)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function eventTone(value: string | null | undefined): StatTone {
  if (!value) return "primary";
  if (/resolv|closed|verified|passed/i.test(value)) return "good";
  if (/escalat|breach|fail|reopen/i.test(value)) return "warn";
  return "primary";
}

function TicketAccessDenied() {
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <div className="glass-strong hf-rise w-full max-w-xl space-y-5 p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-status-warning/15 text-status-warning">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">
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
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
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
  const ticket = rawTicket
    ? await decryptTicketRow(admin, {
        ...rawTicket,
        organization_id: session.organizationId,
      })
    : null;
  if (error || !ticket) return <TicketAccessDenied />;
  if (workflowEnabled && !canAccessTicket(session, ticket))
    return <TicketAccessDenied />;
  const staffVerificationEnabled = isStaffVerificationEnabled();
  let callerPanel: {
    directoryPhone: string | null;
    managerName: string | null;
    privileged: boolean;
    verifiedUntil: string | null;
    verificationRows: Array<{
      method: "directory_callback" | "manager_confirmed" | "idp_push";
      createdAt: string;
    }>;
    pendingApprovals: Array<{
      id: string;
      capabilityId: string;
      expiresAt: string;
    }>;
  } | null = null;
  if (staffVerificationEnabled && ticket.user_id) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 15 * 60_000).toISOString();
    const [directoryFacts, verificationResult, approvalResult] =
      await Promise.all([
        loadCallerDirectoryFacts(admin, session.organizationId, ticket.user_id),
        admin
          .from("staff_caller_verifications")
          .select("method,created_at")
          .eq("organization_id", session.organizationId)
          .eq("ticket_id", ticket.id)
          .eq("subject_user_id", ticket.user_id)
          .gte("created_at", cutoff)
          .lte("created_at", now.toISOString())
          .order("created_at", { ascending: false }),
        admin
          .from("approval_requests")
          .select("id,capability_id,expires_at")
          .eq("organization_id", session.organizationId)
          .eq("ticket_id", ticket.id)
          .eq("type", "technician_approval")
          .eq("status", "requested")
          .gt("expires_at", now.toISOString())
          .order("created_at", { ascending: false }),
      ]);
    const staffAssurance = await loadStaffVerification(admin, {
      organizationId: session.organizationId,
      ticketId: ticket.id,
      subjectUserId: ticket.user_id,
      privileged: directoryFacts?.privileged === true,
      now,
    });
    callerPanel = {
      directoryPhone: directoryFacts?.directoryPhone ?? null,
      managerName: directoryFacts?.managerName ?? null,
      privileged: directoryFacts?.privileged === true,
      verifiedUntil: staffAssurance?.expiresAt ?? null,
      verificationRows: (verificationResult.data ?? []).map((row) => ({
        method: row.method as
          "directory_callback" | "manager_confirmed" | "idp_push",
        createdAt: row.created_at,
      })),
      pendingApprovals: (approvalResult.data ?? []).map((row) => ({
        id: row.id,
        capabilityId: row.capability_id,
        expiresAt: row.expires_at,
      })),
    };
  }
  const exceptionDetails = verificationExceptionDetails(
    ticket.resolution_report
  );
  const excluded = await isRecordExcluded(
    admin,
    session.organizationId,
    "tickets",
    uuid
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
  const { data: rawComments } = workflowEnabled
    ? await admin
        .from("ticket_comments")
        .select("id,message,visibility,author_type,created_at")
        .eq("organization_id", session.organizationId)
        .eq("ticket_id", uuid)
        .order("created_at", { ascending: true })
    : { data: [] };
  const comments = await decryptCommentRows(
    admin,
    (rawComments ?? []).map((row) => ({
      ...row,
      organization_id: session.organizationId,
      message: row.message as string | null,
    }))
  );
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
  let agentSession: {
    id: string;
    steps: Array<{
      kind: string;
      tool_name: string | null;
      result_summary: string | null;
      created_at: string;
    }>;
    webSources: Array<{
      title: string;
      domain: string;
      url: string;
      trust: TrustTier;
    }>;
  } | null = null;
  try {
    const agentResult = await admin
      .from("agent_sessions")
      .select("id,organization_id")
      .eq("organization_id", session.organizationId)
      .eq("escalation_ticket_id", uuid)
      .maybeSingle();
    if (agentResult.data) {
      const stepsResult = await admin
        .from("agent_steps")
        .select("kind,tool_name,result_summary,created_at")
        .eq("organization_id", session.organizationId)
        .eq("session_id", agentResult.data.id)
        .order("seq", { ascending: true });
      let webSources: Array<{
        title: string;
        domain: string;
        url: string;
        trust: TrustTier;
      }> = [];
      try {
        const sourcesResult = await admin
          .from("research_sources")
          .select("url,domain,title,trust,judgement")
          .eq("organization_id", session.organizationId)
          .eq("agent_session_id", agentResult.data.id);
        if (!sourcesResult.error) {
          webSources = (
            (sourcesResult.data ?? []) as Array<{
              url: string;
              domain: string;
              title: string;
              trust: string;
            }>
          ).flatMap((source) => {
            if (
              typeof source.url !== "string" ||
              typeof source.domain !== "string" ||
              typeof source.title !== "string" ||
              (source.trust !== "vendor" &&
                source.trust !== "community" &&
                source.trust !== "reference")
            )
              return [];
            try {
              if (new URL(source.url).protocol !== "https:") return [];
            } catch {
              return [];
            }
            return [
              {
                title: toUserText(source.title, NO_REQUESTER),
                domain: toUserText(source.domain, NO_REQUESTER),
                url: source.url,
                trust: source.trust,
              },
            ];
          });
        }
      } catch {
        webSources = [];
      }
      agentSession = {
        id: agentResult.data.id,
        webSources,
        steps: await Promise.all(
          (stepsResult.data ?? []).map(async (step) => ({
            ...step,
            result_summary: await decryptAgentText(
              admin,
              session.organizationId,
              "agent_steps",
              "result_summary",
              step.result_summary
            ),
          }))
        ),
      };
    }
  } catch {
    agentSession = null;
  }
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

  const sla = slaSnapshot(
    ticket.created_at,
    due,
    status,
    ticket.resolved_at ?? ticket.closed_at ?? null
  );
  const platformLabel = normalizePlatform(ticket.platform);
  const categoryText = ticket.category ?? categoryLabel(ticket.issue_id);
  const publicComments = (comments ?? []).filter(
    (comment) => comment.visibility === "public"
  );
  const internalComments = (comments ?? []).filter(
    (comment) => comment.visibility === "internal"
  );
  const attachmentControls = Object.fromEntries(
    secureAttachments.map((attachment) => [
      attachment.id,
      <AdminAttachmentControls
        key={`controls-${attachment.id}`}
        attachment={attachment}
      />,
    ])
  );

  return (
    <AdminPage>
      {uiV2 && (
        <AdminBreadcrumbs
          items={[
            { label: "Operations", href: "/admin/operations" },
            { label: "Ticket queue", href: "/admin/tickets" },
            { label: toTicketId(ticket.id) },
          ]}
        />
      )}
      <AdminHero
        tone="aurora"
        icon={Ticket}
        eyebrow={<span className="font-mono">{toTicketId(ticket.id)}</span>}
        title={ticket.issue_title}
        description={`${categoryText} · ${platformLabel} · Created ${formatWhen(ticket.created_at)}`}
        actions={
          <Link href="/admin/tickets" className={heroButton}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Ticket queue
          </Link>
        }
      >
        <div className="flex flex-wrap gap-2">
          <HeroChip label="Status" value={status} />
          <HeroChip label="Priority" value={priority} />
          <HeroChip
            label="SLA"
            value={`${sla.state} · ${sla.countdown}`}
            pulse={sla.state === "On track" || sla.state === "Due <1h"}
          />
          <HeroChip
            label="Assigned"
            value={ticket.assigned_agent ?? "Unassigned"}
          />
        </div>
      </AdminHero>

      {uiV2 && (
        <nav
          aria-label="Ticket sections"
          className="glass hf-rise overflow-x-auto p-3"
          style={{ animationDelay: "0.05s" }}
        >
          <ol className="flex min-w-max gap-2 text-xs font-bold xl:min-w-0 xl:flex-wrap">
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
                  className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-primary/40 hover:bg-muted/60"
                >
                  {index + 1}. {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            id={uiV2 ? "user-problem" : undefined}
            title="Description"
            icon={FileText}
            delay={0.05}
          >
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">
              {ticket.message}
            </p>
            <div
              id={uiV2 ? "device-platform" : undefined}
              className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <Laptop className="h-3.5 w-3.5" aria-hidden />
                {platformLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {categoryText}
              </span>
            </div>
            {!secureAttachmentsEnabled && attachmentUrl && (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold underline-offset-4 transition-colors hover:border-primary/40 hover:underline"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
                Open attachment (link valid 60 s)
              </a>
            )}
          </Panel>

          {workflowEnabled && (
            <>
              <Panel
                id={uiV2 ? "public-conversation" : undefined}
                title="Conversation"
                description="Messages the requester can see"
                icon={MessageSquare}
                delay={0.08}
              >
                {publicComments.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="No public messages yet"
                  />
                ) : (
                  <div className="space-y-3">
                    {publicComments.map((comment, index) => {
                      const fromRequester = comment.author_type === "user";
                      const AuthorIcon =
                        comment.author_type === "ai" ||
                        comment.author_type === "assistant"
                          ? Bot
                          : UserRound;
                      return (
                        <div
                          key={comment.id}
                          className={`hf-rise flex items-start gap-2.5 ${
                            fromRequester ? "" : "flex-row-reverse"
                          }`}
                          style={{
                            animationDelay: `${0.1 + Math.min(index, 10) * 0.04}s`,
                          }}
                        >
                          <span
                            aria-hidden
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              fromRequester
                                ? "bg-muted text-muted-foreground"
                                : "bg-secondary text-secondary-foreground"
                            }`}
                          >
                            <AuthorIcon className="h-4 w-4" aria-hidden />
                          </span>
                          <div
                            className={`min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                              fromRequester
                                ? "rounded-tl-md bg-muted/70"
                                : "rounded-tr-md bg-primary/10"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">
                              <strong>{comment.author_type}:</strong>{" "}
                              {comment.message}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                              {formatWhen(comment.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <section
                id={uiV2 ? "internal-notes" : undefined}
                aria-describedby={
                  uiV2 ? "internal-notes-description" : undefined
                }
                className="glass hf-rise overflow-hidden border-dashed border-status-warning/40 bg-status-warning/5 p-5 sm:px-6"
                style={{ animationDelay: "0.1s" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-warning/15 text-status-warning">
                      <Lock className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-extrabold">Internal notes</h2>
                      <p
                        id={uiV2 ? "internal-notes-description" : undefined}
                        className="text-sm text-muted-foreground"
                      >
                        Internal — not visible to user
                      </p>
                    </div>
                  </div>
                  <StatusPill tone="warn">Private — staff only</StatusPill>
                </div>
                <div className="mt-4 space-y-3">
                  {internalComments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No internal notes yet.
                    </p>
                  ) : (
                    internalComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-2xl border border-status-warning/25 bg-status-warning/10 p-3 text-sm"
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {comment.message}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                          {formatWhen(comment.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {investigation && (
                <div
                  id={uiV2 ? "investigation" : undefined}
                  className={embedClass}
                  style={{ animationDelay: "0.12s" }}
                >
                  <TicketInvestigation
                    investigation={investigation.investigation}
                    turns={investigation.turns}
                  />
                </div>
              )}

              {escalationPackage && (
                <div
                  id={uiV2 ? "diagnosis" : undefined}
                  className={embedClass}
                  style={{ animationDelay: "0.14s" }}
                >
                  <EscalationPackageCard
                    pkg={escalationPackage}
                    snapshotAt={escalationSnapshotAt}
                  />
                </div>
              )}

              <Panel
                id={uiV2 ? "classification" : undefined}
                title="AI classification"
                icon={Cpu}
                delay={0.16}
              >
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    [
                      "Recommended guide:",
                      ticket.ai_recommended_issue_id ?? "—",
                    ],
                    ...(citation
                      ? [["Guide version:", `v${citation.version}`]]
                      : []),
                    ["Confidence:", String(ticket.ai_confidence ?? "—")],
                    ["Risk:", ticket.ai_risk_level ?? "—"],
                    [
                      "Handoff reason:",
                      formatHandoffReason(ticket.handoff_reason ?? null) ?? "—",
                    ],
                    [
                      "AI attempts:",
                      `${ticket.ai_failed_attempts ?? 0} failed of 2`,
                    ],
                    [
                      "Diagnostic questions asked:",
                      String(ticket.ai_question_count ?? 0),
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-border bg-card/60 p-3"
                    >
                      <dt className="text-xs font-bold text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-0.5 break-words font-extrabold">
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div
                    id={uiV2 ? "questions" : undefined}
                    className="rounded-2xl border border-border bg-card/60 p-3 sm:col-span-2"
                  >
                    <dt className="text-xs font-bold text-muted-foreground">
                      Diagnostic answers:
                    </dt>
                    <dd className="mt-0.5 break-words font-mono text-xs">
                      {Array.isArray(ticket.diagnostic_answers) &&
                      ticket.diagnostic_answers.length === 0
                        ? "None recorded"
                        : JSON.stringify(ticket.diagnostic_answers ?? [])}
                    </dd>
                  </div>
                </dl>
              </Panel>

              {agentSession && (
                <Panel
                  title="Agent session"
                  icon={Bot}
                  delay={0.18}
                  description={
                    <>
                      Actions proposed:{" "}
                      {
                        agentSession.steps.filter(
                          (step) => step.kind === "action_proposed"
                        ).length
                      }{" "}
                      · consented:{" "}
                      {
                        agentSession.steps.filter(
                          (step) =>
                            step.kind === "consent_decided" &&
                            step.result_summary?.toLowerCase().includes("grant")
                        ).length
                      }{" "}
                      · verified:{" "}
                      {
                        agentSession.steps.filter(
                          (step) =>
                            step.kind === "verification_result" &&
                            step.result_summary
                              ?.toLowerCase()
                              .includes("passed")
                        ).length
                      }
                    </>
                  }
                >
                  {agentSession.webSources.length > 0 && (
                    <section className="mb-4 rounded-2xl border border-border bg-card/60 p-3">
                      <p className="text-sm font-semibold">
                        Web sources the assistant used
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {agentSession.webSources.map((source, index) => (
                          <li key={`${source.url}-${index}`}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="font-medium underline underline-offset-4"
                            >
                              {source.title}
                            </a>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {source.domain} · {trustLabel(source.trust)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <TimelineList
                    empty="No agent steps recorded."
                    items={agentSession.steps.map((step, index) => ({
                      key: `${step.kind}-${step.created_at}-${index}`,
                      title: `${agentStepLabels[step.kind] ?? step.kind}${
                        step.tool_name ? ` · ${step.tool_name}` : ""
                      }`,
                      detail: step.result_summary ?? undefined,
                      when: step.created_at,
                      tone: eventTone(step.result_summary ?? step.kind),
                    }))}
                  />
                </Panel>
              )}

              <Panel
                id={uiV2 ? "step-outcomes" : undefined}
                title="Step outcomes"
                icon={CheckCircle2}
                delay={0.2}
              >
                <ul className="space-y-2 text-sm">
                  {(stepOutcomes ?? []).length === 0 ? (
                    <li className="text-muted-foreground">
                      No outcomes recorded.
                    </li>
                  ) : (
                    (stepOutcomes ?? []).map((outcome, index) => (
                      <li
                        key={`${outcome.guide_slug}-${outcome.step_index}`}
                        className="hf-adm-row flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/60 px-3 py-2"
                        style={{
                          animationDelay: `${Math.min(index, 10) * 0.04}s`,
                        }}
                      >
                        <span className="font-bold">
                          Step {outcome.step_index + 1} → {outcome.outcome} ·{" "}
                          <span className="font-semibold text-muted-foreground">
                            {formatWhen(outcome.created_at)}
                          </span>
                        </span>
                        <StatusPill tone={eventTone(outcome.outcome)}>
                          {outcome.outcome}
                        </StatusPill>
                      </li>
                    ))
                  )}
                </ul>
              </Panel>

              {uiV2 && (
                <Panel
                  id="restricted-steps"
                  title="Withheld/restricted steps"
                  icon={ShieldCheck}
                  delay={0.22}
                >
                  <p className="text-sm text-muted-foreground">
                    No restricted steps are recorded for this ticket.
                  </p>
                </Panel>
              )}
            </>
          )}

          {secureAttachmentsEnabled && (
            <div
              id={uiV2 ? "attachments" : undefined}
              className={embedClass}
              style={{ animationDelay: "0.24s" }}
            >
              <AttachmentList
                attachments={secureAttachments}
                adminControls={attachmentControls}
              />
            </div>
          )}

          {workflowEnabled && (
            <>
              <Panel
                id={uiV2 ? "tools-actions" : undefined}
                title="System activity"
                icon={Activity}
                delay={0.26}
              >
                <TimelineList
                  empty="No system activity recorded."
                  items={(workflowEvents ?? []).map((event) => ({
                    key: String(event.id),
                    title: event.event_type,
                    when: event.created_at,
                    tone: eventTone(event.event_type),
                  }))}
                />
              </Panel>
              <Panel title="Tools & actions" icon={Cpu} delay={0.28}>
                {(actions ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tools or actions recorded.
                  </p>
                ) : (
                  <ul className="space-y-2.5 text-sm">
                    {(actions ?? []).map((action, index) => (
                      <li
                        key={action.id}
                        className="hf-adm-row rounded-2xl border border-border bg-card/60 p-3"
                        style={{
                          animationDelay: `${Math.min(index, 10) * 0.04}s`,
                        }}
                      >
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
                )}
              </Panel>
            </>
          )}

          {resolutionTrackingEnabled && (
            <Panel
              id={uiV2 ? "resolution" : undefined}
              title="Resolution"
              icon={CheckCircle2}
              delay={0.3}
            >
              {exceptionDetails && (
                <div className="mb-4 inline-flex flex-col items-start gap-1 rounded-2xl border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-sm">
                  <strong className="inline-flex items-center gap-1.5">
                    <AlertTriangle
                      className="h-4 w-4 text-status-warning"
                      aria-hidden
                    />
                    Verified by employee exception
                  </strong>
                  <span>Method: {exceptionDetails.method}</span>
                  <span>Reason: {exceptionDetails.reason}</span>
                </div>
              )}
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold text-muted-foreground">
                    Resolved by
                  </dt>
                  <dd className="font-extrabold">
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
                  <dt className="text-xs font-bold text-muted-foreground">
                    AI attempted
                  </dt>
                  <dd className="font-extrabold">
                    {ticket.ai_attempted ? "Yes" : "No"}
                    {ticket.ai_attempted_at
                      ? ` · ${formatWhen(ticket.ai_attempted_at)}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-muted-foreground">
                    Recommended guide
                  </dt>
                  <dd className="font-extrabold">
                    {recommendedIssue?.title ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-muted-foreground">
                    Escalated
                  </dt>
                  <dd className="font-extrabold">
                    {ticket.escalated ? "Yes" : "No"}
                    {ticket.escalated_at
                      ? ` · ${formatWhen(ticket.escalated_at)}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-muted-foreground">
                    Escalation reason
                  </dt>
                  <dd className="font-extrabold">
                    {ticket.escalation_reason ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-muted-foreground">
                    User confirmed
                  </dt>
                  <dd className="font-extrabold">
                    {ticket.user_confirmed && ticket.user_confirmed_at
                      ? formatWhen(ticket.user_confirmed_at)
                      : "Not confirmed"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-bold text-muted-foreground">
                    Resolution summary
                  </dt>
                  <dd className="font-extrabold">
                    {ticket.resolution_summary ?? "—"}
                  </dd>
                </div>
              </dl>
            </Panel>
          )}

          <Panel
            id={uiV2 ? "timeline" : undefined}
            title="Timeline"
            icon={History}
            delay={0.32}
          >
            <TimelineList
              empty="No ticket events recorded yet."
              items={(events ?? []).map((event, index) => ({
                key: `${event.created_at}-${index}`,
                title: event.event_type,
                detail:
                  event.from_value || event.to_value
                    ? `${event.from_value ? `${event.from_value} → ` : ""}${
                        event.to_value ?? ""
                      }`
                    : undefined,
                when: event.created_at,
                tone: eventTone(event.to_value ?? event.event_type),
              }))}
            />
          </Panel>
        </div>

        {/* Action rail */}
        <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pb-2 xl:pr-1">
          <Panel
            id={uiV2 ? "assignment-sla" : undefined}
            title="Assignment and SLA"
            icon={Timer}
            delay={0.06}
          >
            <div className="rounded-2xl border border-border bg-card/60 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <StatusPill
                  tone={sla.tone}
                  pulse={sla.state === "Breached" || sla.state === "Due <1h"}
                >
                  {sla.state}
                </StatusPill>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {sla.countdown}
                </span>
              </div>
              <span
                className="mt-3 block h-2 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-label="SLA time used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(sla.progress * 100)}
              >
                <span
                  className={`hf-adm-grow block h-full rounded-full ${SLA_BAR[sla.tone]}`}
                  style={{
                    width: `${Math.max(2, Math.round(sla.progress * 100))}%`,
                    animationDelay: "0.3s",
                  }}
                />
              </span>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                SLA due: {formatWhen(due)}
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-bold text-muted-foreground">
                  Status:
                </dt>
                <dd className="mt-1">
                  <StatusPill tone={statusTone(status)}>{status}</StatusPill>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-muted-foreground">
                  Priority:
                </dt>
                <dd className="mt-1">
                  <StatusPill
                    tone={priorityTone(priority)}
                    pulse={priority === "Urgent"}
                  >
                    {priority}
                  </StatusPill>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-muted-foreground">
                  Category:
                </dt>
                <dd className="font-extrabold">{categoryText}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-muted-foreground">
                  Platform:
                </dt>
                <dd className="font-extrabold">{platformLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-muted-foreground">
                  Created:
                </dt>
                <dd className="font-semibold">
                  {formatWhen(ticket.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold text-muted-foreground">
                  Updated:
                </dt>
                <dd className="font-semibold">
                  {formatWhen(ticket.updated_at ?? ticket.created_at)}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="People" icon={UserRound} delay={0.1}>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-muted-foreground">
                    Requester
                  </span>
                  <span
                    className="block truncate font-mono text-xs font-semibold"
                    title={ticket.user_id}
                  >
                    {ticket.user_id}
                  </span>
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-muted-foreground">
                    Agent:
                  </span>
                  <span className="block truncate font-extrabold">
                    {ticket.assigned_agent ?? "Unassigned"}
                  </span>
                </span>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <RecordExclusionControl
                table="tickets"
                recordId={uuid}
                canExclude={session.role === "org_admin"}
                excluded={excluded}
              />
            </div>
          </Panel>

          {callerPanel && (
            <CallerVerificationPanel ticketId={ticket.id} {...callerPanel} />
          )}

          <TicketUpdateForm
            ticketId={uuid}
            status={status}
            priority={priority}
            assignedAgent={ticket.assigned_agent ?? ""}
            resolutionTrackingEnabled={resolutionTrackingEnabled}
            resolutionSummary={ticket.resolution_summary ?? ""}
            workflowEnabled={workflowEnabled}
            uiV2={uiV2}
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
    </AdminPage>
  );
}
