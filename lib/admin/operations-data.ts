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
  to: string;
  sla?: string;
  page: number;
  pageSize: number;
};

export type AdminOperationsTicket = {
  ticketUuid: string;
  ticketId: string;
  createdAt: string;
  updatedAt: string;
  lastUpdatedAt: string;
  status: "New" | "In Progress" | "Waiting" | "Resolved" | "Closed";
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
};

export type OperationsData = {
  generatedAt: string;
  organizationId: string;
  role: AdminSession["role"];
  metrics: AdminMetric;
  tickets: {
    rows: AdminOperationsTicket[];
    page: number;
    pageSize: number;
    total: number;
  };
  filters: AdminFilters;
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

export function defaultAdminFilters(now = new Date()): AdminFilters {
  const to = now.toISOString();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { from, to, page: 1, pageSize: 25 };
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

  let query = admin
    .from("tickets")
    .select(
      "id, user_id, issue_id, issue_title, category, status, priority, assigned_agent, platform, created_at, updated_at, first_response_at, resolved_at, attachment_path",
      { count: "exact" }
    )
    .eq("organization_id", session.organizationId)
    .gte("created_at", filters.from)
    .lte("created_at", filters.to)
    .order("created_at", { ascending: false });

  if (filters.status === "open") {
    query = query.in("status", [
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
    query = query.in("status", ["Resolved", "resolved", "Closed", "closed"]);
  } else if (filters.status === "New") {
    query = query.in("status", ["New", "new", "Open", "open"]);
  } else if (filters.status === "In Progress") {
    query = query.in("status", [
      "In Progress",
      "in progress",
      "in_progress",
      "in-progress",
    ]);
  } else if (filters.status) {
    query = query.in("status", [filters.status, filters.status.toLowerCase()]);
  }
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.agent)
    query = query.ilike("assigned_agent", `%${filters.agent}%`);

  const needsSlaFilter = Boolean(filters.sla);
  const result = needsSlaFilter
    ? await query.limit(500)
    : await query.range(
        (filters.page - 1) * filters.pageSize,
        filters.page * filters.pageSize - 1
      );
  if (result.error) console.error("admin tickets query failed", result.error);

  const rows = (result.data ?? []).map((row) => {
    const status = normalizeStatus(row.status);
    const priority = normalizePriority(row.priority);
    const due = slaDue(row.created_at, priority);
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
      slaDue: due,
      firstResponseAt: row.first_response_at ?? null,
      resolvedAt: row.resolved_at ?? null,
      platform: normalizePlatform(row.platform),
      hasAttachment: Boolean(row.attachment_path),
      slaState: slaState(status, due),
    } satisfies AdminOperationsTicket;
  });
  const filteredRows = filters.sla
    ? rows.filter((row) => slaFilterValue(row.slaState) === filters.sla)
    : rows;
  const pagedRows = needsSlaFilter
    ? filteredRows.slice(
        (filters.page - 1) * filters.pageSize,
        filters.page * filters.pageSize
      )
    : filteredRows;

  return {
    generatedAt: new Date().toISOString(),
    organizationId: session.organizationId,
    role: session.role,
    metrics: metricError ? EMPTY_METRICS : mapMetrics(metricData),
    tickets: {
      rows: pagedRows,
      page: filters.page,
      pageSize: filters.pageSize,
      total: needsSlaFilter ? filteredRows.length : (result.count ?? 0),
    },
    filters,
  };
}
