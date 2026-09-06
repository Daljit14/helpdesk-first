import { createAdminClient } from "@/lib/supabase/admin";
import {
  categoryLabel,
  normalizePlatform,
  normalizePriority,
  normalizeStatus,
  pseudonymizeUser,
  slaDue,
  toTicketId,
} from "@/lib/operations/transform";
import type { AdminSession } from "./auth";
import { isResolutionTrackingEnabled } from "./flags";

export type AdminMetric = {
  activeUsers: number;
  uniqueVisitorsToday: number;
  pageViewsToday: number;
  totalTickets: number;
  openTickets: number;
  newTickets: number;
  inProgressTickets: number;
  waitingTickets: number;
  urgentOpenTickets: number;
  completedToday: number;
  totalCompleted: number;
  slaBreached: number;
  avgFirstResponseMinutes: number;
  avgResolutionMinutes: number;
  ticketsByCategory: { key: string; count: number }[];
  ticketsByPlatform: { key: string; count: number }[];
  agentWorkload: {
    agent: string;
    open: number;
    urgent: number;
    breached: number;
    waiting: number;
    resolvedToday: number;
  }[];
};

export type AdminFilters = {
  status?: string;
  priority?: string;
  category?: string;
  platform?: string;
  agent?: string;
  from: string;
  to?: string;
  sla?: string;
  resolutionSource?: "ai" | "agent" | "self_service" | "unresolved";
  queue?:
    | "needs_human"
    | "assigned_to_me"
    | "unassigned"
    | "ai_working"
    | "waiting"
    | "sla_breached"
    | "resolved";
  page: number;
  pageSize: number;
};

export type ResolutionDailyPoint = {
  day: string;
  aiSolved: number;
  agentSolved: number;
  escalated: number;
  created: number;
};

export type ResolutionMetrics = {
  totalTickets: number;
  openTickets: number;
  aiAttempted: number;
  aiSolved: number;
  agentSolved: number;
  selfServiceSolved: number;
  escalated: number;
  aiResolutionRate: number;
  avgResolutionMinutes: number;
  avgAiResolutionMinutes: number;
  avgAgentResolutionMinutes: number;
  daily: ResolutionDailyPoint[];
};

export type AdminOperationsTicket = {
  ticketUuid: string;
  ticketId: string;
  createdAt: string;
  updatedAt: string;
  lastUpdatedAt: string;
  status:
    | "New"
    | "AI Reviewing"
    | "AI Resolving"
    | "Needs Human"
    | "In Progress"
    | "Waiting"
    | "Waiting for User"
    | "Pending Verification"
    | "Resolved"
    | "Closed";
  priority: "Low" | "Normal" | "High" | "Urgent";
  category: string;
  issueTitle: string;
  userKey: string;
  assignedAgent: string;
  slaDue: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  platform: "Windows" | "macOS" | "Linux" | "Android" | "iOS" | "Other";
  hasAttachment: boolean;
  slaState: "Breached" | "Due <1h" | "On track" | "Closed";
  resolvedBy: "AI assistant" | "Support agent" | "Self-service" | null;
  aiAttempted: boolean;
  escalated: boolean;
  assignedAgentId?: string | null;
  resolverType?: string;
  aiConfidence?: number | null;
  handoffReason?: string | null;
  waitingMinutes?: number;
  humanResponseDueAt?: string | null;
};

export type OperationsData = {
  generatedAt: string;
  organizationId: string;
  role: AdminSession["role"];
  organizationName: string;
  metrics: AdminMetric;
  resolution: ResolutionMetrics | null;
  workflow?: WorkflowMetrics | null;
  tickets: {
    rows: AdminOperationsTicket[];
    page: number;
    pageSize: number;
    total: number;
  };
  filters: AdminFilters;
};

export type WorkflowMetrics = {
  needsHuman: number;
  aiResolving: number;
  inProgress: number;
  waitingForUser: number;
  pendingVerification: number;
  slaAtRisk: number;
  slaBreached: number;
  resolvedByAi: number;
  resolvedByEmployees: number;
  unassignedNeedsHuman: number;
};

const EMPTY_METRICS: AdminMetric = {
  activeUsers: 0,
  uniqueVisitorsToday: 0,
  pageViewsToday: 0,
  totalTickets: 0,
  openTickets: 0,
  newTickets: 0,
  inProgressTickets: 0,
  waitingTickets: 0,
  urgentOpenTickets: 0,
  completedToday: 0,
  totalCompleted: 0,
  slaBreached: 0,
  avgFirstResponseMinutes: 0,
  avgResolutionMinutes: 0,
  ticketsByCategory: [],
  ticketsByPlatform: [],
  agentWorkload: [],
};

const EMPTY_RESOLUTION: ResolutionMetrics = {
  totalTickets: 0,
  openTickets: 0,
  aiAttempted: 0,
  aiSolved: 0,
  agentSolved: 0,
  selfServiceSolved: 0,
  escalated: 0,
  aiResolutionRate: 0,
  avgResolutionMinutes: 0,
  avgAiResolutionMinutes: 0,
  avgAgentResolutionMinutes: 0,
  daily: [],
};
const EMPTY_WORKFLOW: WorkflowMetrics = {
  needsHuman: 0,
  aiResolving: 0,
  inProgress: 0,
  waitingForUser: 0,
  pendingVerification: 0,
  slaAtRisk: 0,
  slaBreached: 0,
  resolvedByAi: 0,
  resolvedByEmployees: 0,
  unassignedNeedsHuman: 0,
};

type WorkflowTicketRow = {
  id: string;
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
  needs_human_at?: string | null;
  resolved_at: string | null;
  attachment_path: string | null;
  resolution_source: string | null;
  resolver_type?: string | null;
  ai_confidence?: number | null;
  handoff_reason?: string | null;
  ai_attempted: boolean;
  escalated: boolean;
};

type TicketQuery = {
  eq(column: string, value: unknown): TicketQuery;
  gte(column: string, value: unknown): TicketQuery;
  lte(column: string, value: unknown): TicketQuery;
  order(column: string, options: { ascending: boolean }): TicketQuery;
  in(column: string, values: string[]): TicketQuery;
  is(column: string, value: null): TicketQuery;
  ilike(column: string, value: string): TicketQuery;
  limit(value: number): Promise<{
    data: WorkflowTicketRow[] | null;
    error: Error | null;
    count: number | null;
  }>;
  range(
    start: number,
    end: number
  ): Promise<{
    data: WorkflowTicketRow[] | null;
    error: Error | null;
    count: number | null;
  }>;
};

function slaState(
  status: AdminOperationsTicket["status"],
  due: string,
  now = Date.now()
): AdminOperationsTicket["slaState"] {
  if (status === "Resolved" || status === "Closed") return "Closed";
  const dueAt = new Date(due).getTime();
  if (dueAt < now) return "Breached";
  if (dueAt - now < 60 * 60 * 1000) return "Due <1h";
  return "On track";
}

function slaFilterValue(state: AdminOperationsTicket["slaState"]): string {
  if (state === "Due <1h") return "due_soon";
  return state.toLowerCase();
}

function mapMetrics(value: unknown): AdminMetric {
  if (!value || typeof value !== "object") return EMPTY_METRICS;
  const raw = value as Record<string, unknown>;
  return {
    activeUsers: Number(raw.activeUsers ?? 0),
    uniqueVisitorsToday: Number(raw.uniqueVisitorsToday ?? 0),
    pageViewsToday: Number(raw.pageViewsToday ?? 0),
    totalTickets: Number(raw.totalTickets ?? 0),
    openTickets: Number(raw.openTickets ?? 0),
    newTickets: Number(raw.newTickets ?? 0),
    inProgressTickets: Number(raw.inProgressTickets ?? 0),
    waitingTickets: Number(raw.waitingTickets ?? 0),
    urgentOpenTickets: Number(raw.urgentOpenTickets ?? 0),
    completedToday: Number(raw.completedToday ?? 0),
    totalCompleted: Number(raw.totalCompleted ?? 0),
    slaBreached: Number(raw.slaBreached ?? 0),
    avgFirstResponseMinutes: Number(raw.avgFirstResponseMinutes ?? 0),
    avgResolutionMinutes: Number(raw.avgResolutionMinutes ?? 0),
    ticketsByCategory: Array.isArray(raw.ticketsByCategory)
      ? raw.ticketsByCategory.map((row) => ({
          key: String(row.key),
          count: Number(row.count),
        }))
      : [],
    ticketsByPlatform: Array.isArray(raw.ticketsByPlatform)
      ? raw.ticketsByPlatform.map((row) => ({
          key: String(row.key),
          count: Number(row.count),
        }))
      : [],
    agentWorkload: Array.isArray(raw.agentWorkload)
      ? raw.agentWorkload.map((row) => ({
          agent: String(row.agent),
          open: Number(row.open),
          urgent: Number(row.urgent),
          breached: Number(row.breached),
          waiting: Number(row.waiting),
          resolvedToday: Number(row.resolvedToday),
        }))
      : [],
  };
}

function mapResolutionMetrics(value: unknown): ResolutionMetrics {
  if (!value || typeof value !== "object") return EMPTY_RESOLUTION;
  const raw = value as Record<string, unknown>;
  return {
    totalTickets: Number(raw.totalTickets ?? 0),
    openTickets: Number(raw.openTickets ?? 0),
    aiAttempted: Number(raw.aiAttempted ?? 0),
    aiSolved: Number(raw.aiSolved ?? 0),
    agentSolved: Number(raw.agentSolved ?? 0),
    selfServiceSolved: Number(raw.selfServiceSolved ?? 0),
    escalated: Number(raw.escalated ?? 0),
    aiResolutionRate: Number(raw.aiResolutionRate ?? 0),
    avgResolutionMinutes: Number(raw.avgResolutionMinutes ?? 0),
    avgAiResolutionMinutes: Number(raw.avgAiResolutionMinutes ?? 0),
    avgAgentResolutionMinutes: Number(raw.avgAgentResolutionMinutes ?? 0),
    daily: Array.isArray(raw.daily)
      ? raw.daily.map((row) => {
          const point = row as Record<string, unknown>;
          return {
            day: String(point.day),
            aiSolved: Number(point.aiSolved ?? 0),
            agentSolved: Number(point.agentSolved ?? 0),
            escalated: Number(point.escalated ?? 0),
            created: Number(point.created ?? 0),
          };
        })
      : [],
  };
}

function mapWorkflowMetrics(value: unknown): WorkflowMetrics {
  if (!value || typeof value !== "object") return EMPTY_WORKFLOW;
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(EMPTY_WORKFLOW).map((key) => [key, Number(raw[key] ?? 0)])
  ) as WorkflowMetrics;
}

export function defaultAdminFilters(now = new Date()): AdminFilters {
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { from, page: 1, pageSize: 25 };
}

export async function getOperationsData(
  session: AdminSession,
  filters: AdminFilters
): Promise<OperationsData> {
  const admin = createAdminClient();
  const { data: metricData, error: metricError } = await admin.rpc(
    "admin_operations_metrics",
    { org: session.organizationId }
  );
  if (metricError) console.error("admin metrics query failed", metricError);
  const resolutionEnabled = isResolutionTrackingEnabled();
  const workflowEnabled =
    process.env.HELP_DESK_TICKET_WORKFLOW_ENABLED === "true";
  const { data: resolutionData, error: resolutionError } = resolutionEnabled
    ? await admin.rpc("admin_resolution_metrics", {
        org: session.organizationId,
      })
    : { data: null, error: null };
  if (resolutionError)
    console.error("admin resolution metrics query failed", resolutionError);
  const { data: workflowData, error: workflowError } = workflowEnabled
    ? await admin.rpc("admin_workflow_metrics", { org: session.organizationId })
    : { data: null, error: null };
  if (workflowError)
    console.error("admin workflow metrics query failed", workflowError);
  const { data: organization } = await admin
    .from("organizations")
    .select("name")
    .eq("id", session.organizationId)
    .maybeSingle();

  const query = (workflowEnabled
    ? admin
        .from("tickets")
        .select(
          "id, user_id, issue_id, issue_title, category, status, priority, assigned_agent, assigned_agent_id, platform, created_at, updated_at, first_response_at, first_human_response_at, human_response_due_at, needs_human_at, resolved_at, attachment_path, resolution_source, resolver_type, ai_confidence, handoff_reason, ai_attempted, escalated",
          { count: "exact" }
        )
    : admin
        .from("tickets")
        .select(
          "id, user_id, issue_id, issue_title, category, status, priority, assigned_agent, platform, created_at, updated_at, first_response_at, resolved_at, attachment_path, resolution_source, ai_attempted, escalated",
          { count: "exact" }
        )) as unknown as TicketQuery;
  const filteredQuery = query
    .eq("organization_id", session.organizationId)
    .gte("created_at", filters.from)
    .order("created_at", { ascending: false });
  let activeQuery = filteredQuery;
  if (filters.to) activeQuery = activeQuery.lte("created_at", filters.to);

  if (filters.status === "open") {
    activeQuery = activeQuery.in("status", [
      "Open",
      "open",
      "New",
      "new",
      "In Progress",
      "in progress",
      "in_progress",
      "in-progress",
      "Waiting",
      "waiting",
    ]);
  } else if (filters.status === "completed") {
    activeQuery = activeQuery.in("status", [
      "Resolved",
      "resolved",
      "Closed",
      "closed",
    ]);
  } else if (filters.status === "New") {
    activeQuery = activeQuery.in("status", ["New", "new", "Open", "open"]);
  } else if (filters.status === "In Progress") {
    activeQuery = activeQuery.in("status", [
      "In Progress",
      "in progress",
      "in_progress",
      "in-progress",
    ]);
  } else if (filters.status) {
    activeQuery = activeQuery.in("status", [
      filters.status,
      filters.status.toLowerCase(),
    ]);
  }
  if (filters.resolutionSource === "unresolved") {
    activeQuery = activeQuery.is("resolution_source", null);
  } else if (filters.resolutionSource) {
    activeQuery = activeQuery.eq("resolution_source", filters.resolutionSource);
  }
  if (filters.priority)
    activeQuery = activeQuery.eq("priority", filters.priority);
  if (filters.category)
    activeQuery = activeQuery.eq("category", filters.category);
  if (filters.platform)
    activeQuery = activeQuery.eq("platform", filters.platform);
  if (filters.agent)
    activeQuery = activeQuery.ilike("assigned_agent", `%${filters.agent}%`);
  if (filters.queue === "assigned_to_me")
    activeQuery = activeQuery.eq("assigned_agent_id", session.userId);
  if (filters.queue === "unassigned")
    activeQuery = activeQuery.is("assigned_agent_id", null);
  if (filters.queue === "needs_human")
    activeQuery = activeQuery.eq("status", "Needs Human");
  if (filters.queue === "ai_working")
    activeQuery = activeQuery.in("status", ["AI Reviewing", "AI Resolving"]);
  if (filters.queue === "waiting")
    activeQuery = activeQuery.eq("status", "Waiting for User");
  if (filters.queue === "resolved")
    activeQuery = activeQuery.in("status", ["Resolved", "Closed"]);

  const needsSlaFilter = Boolean(
    filters.sla || filters.queue === "sla_breached"
  );
  const result = needsSlaFilter
    ? await activeQuery.limit(500)
    : await activeQuery.range(
        (filters.page - 1) * filters.pageSize,
        filters.page * filters.pageSize - 1
      );
  if (result.error) console.error("admin tickets query failed", result.error);

  const rows = (result.data ?? []).map((row) => {
    const status = normalizeStatus(row.status);
    const priority = normalizePriority(row.priority);
    const due = row.human_response_due_at ?? slaDue(row.created_at, priority);
    return {
      ticketUuid: row.id,
      ticketId: toTicketId(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
      lastUpdatedAt: row.updated_at ?? row.created_at,
      status,
      priority,
      category: row.category ?? categoryLabel(row.issue_id),
      issueTitle: row.issue_title,
      userKey: pseudonymizeUser(row.user_id),
      assignedAgent: row.assigned_agent ?? "",
      assignedAgentId: row.assigned_agent_id ?? null,
      resolverType: row.resolver_type ?? "unassigned",
      aiConfidence: row.ai_confidence ?? null,
      handoffReason: row.handoff_reason ?? null,
      waitingMinutes: row.needs_human_at
        ? Math.max(
            0,
            Math.round(
              (Date.now() -
                Math.max(
                  new Date(row.needs_human_at).getTime(),
                  new Date(row.updated_at ?? row.created_at).getTime()
                )) /
                60000
            )
          )
        : 0,
      humanResponseDueAt: row.human_response_due_at ?? null,
      slaDue: due,
      firstResponseAt: row.first_response_at ?? null,
      resolvedAt: row.resolved_at ?? null,
      platform: normalizePlatform(row.platform),
      hasAttachment: Boolean(row.attachment_path),
      slaState: slaState(status, due),
      resolvedBy:
        row.resolution_source === "ai"
          ? "AI assistant"
          : row.resolution_source === "agent"
            ? "Support agent"
            : row.resolution_source === "self_service"
              ? "Self-service"
              : null,
      aiAttempted: Boolean(row.ai_attempted),
      escalated: Boolean(row.escalated),
    } satisfies AdminOperationsTicket;
  });
  const filteredRows = filters.sla
    ? rows.filter((row) => slaFilterValue(row.slaState) === filters.sla)
    : rows;
  const queueRows =
    filters.queue === "sla_breached"
      ? filteredRows.filter((row) => row.slaState === "Breached")
      : filteredRows;
  const pagedRows = needsSlaFilter
    ? filteredRows.slice(
        (filters.page - 1) * filters.pageSize,
        filters.page * filters.pageSize
      )
    : queueRows;

  return {
    generatedAt: new Date().toISOString(),
    organizationId: session.organizationId,
    role: session.role,
    organizationName: organization?.name ?? "Organization",
    metrics: metricError ? EMPTY_METRICS : mapMetrics(metricData),
    resolution:
      resolutionEnabled && !resolutionError
        ? mapResolutionMetrics(resolutionData)
        : resolutionEnabled
          ? EMPTY_RESOLUTION
          : null,
    workflow:
      workflowEnabled && !workflowError
        ? mapWorkflowMetrics(workflowData)
        : workflowEnabled
          ? EMPTY_WORKFLOW
          : null,
    tickets: {
      rows: pagedRows,
      page: filters.page,
      pageSize: filters.pageSize,
      total:
        needsSlaFilter || filters.queue === "sla_breached"
          ? queueRows.length
          : (result.count ?? 0),
    },
    filters,
  };
}
