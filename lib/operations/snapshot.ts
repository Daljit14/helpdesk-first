import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildAgentQueue,
  categoryLabel as getCategoryLabel,
  normalizePlatform,
  normalizePriority,
  normalizeStatus,
  pseudonymizeUser,
  slaDue,
  toTicketId,
  type AgentQueueLike,
  type OperationsPlatform,
  type OperationsPriority,
  type OperationsStatus,
} from "./transform";

export type OperationsTicket = {
  ticketId: string;
  createdAt: string;
  updatedAt: string;
  status: OperationsStatus;
  priority: OperationsPriority;
  category: string;
  issueTitle: string;
  userKey: string;
  assignedAgent: string;
  slaDue: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  platform: OperationsPlatform;
  hasAttachment: boolean;
};

export type TrafficPoint = {
  timestamp: string;
  activeUsers5m: number;
  pageViewsPerMin: number;
  uniqueVisitorsToday: number;
  sessionsToday: number;
  guideViewsPerMin: number;
  assistantStartsPerMin: number;
  ticketsCreatedPerMin: number;
};

export type AgentQueueRow = AgentQueueLike;

export type OperationsSnapshot = {
  generatedAt: string;
  liveTickets: OperationsTicket[];
  trafficTimeline: TrafficPoint;
  agentQueue: AgentQueueRow[];
};

const emptyTraffic = (timestamp = new Date().toISOString()): TrafficPoint => ({
  timestamp,
  activeUsers5m: 0,
  pageViewsPerMin: 0,
  uniqueVisitorsToday: 0,
  sessionsToday: 0,
  guideViewsPerMin: 0,
  assistantStartsPerMin: 0,
  ticketsCreatedPerMin: 0,
});

export async function getOperationsSnapshot(): Promise<OperationsSnapshot> {
  const generatedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tickets")
    .select(
      "id, user_id, issue_id, issue_title, status, priority, assigned_agent, platform, created_at, updated_at, first_response_at, resolved_at, attachment_path"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) console.error("operations tickets query failed", error);

  let trafficTimeline = emptyTraffic(generatedAt);
  const { data: traffic, error: trafficError } = await admin.rpc(
    "operations_traffic_snapshot"
  );
  if (trafficError) {
    console.error("operations traffic query failed", trafficError);
  } else if (traffic?.[0]) {
    const row = traffic[0] as Record<string, unknown>;
    trafficTimeline = {
      timestamp: String(row.timestamp ?? generatedAt),
      activeUsers5m: Number(row.active_users_5m ?? 0),
      pageViewsPerMin: Number(row.page_views_per_min ?? 0),
      uniqueVisitorsToday: Number(row.unique_visitors_today ?? 0),
      sessionsToday: Number(row.sessions_today ?? 0),
      guideViewsPerMin: Number(row.guide_views_per_min ?? 0),
      assistantStartsPerMin: Number(row.assistant_starts_per_min ?? 0),
      ticketsCreatedPerMin: Number(row.tickets_created_per_min ?? 0),
    };
  }

  const tickets: OperationsTicket[] = (data ?? []).map((row) => {
    const status = normalizeStatus(row.status);
    const priority = normalizePriority(row.priority);
    return {
      ticketId: toTicketId(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
      status,
      priority,
      category: getCategoryLabel(row.issue_id),
      issueTitle: row.issue_title,
      userKey: pseudonymizeUser(row.user_id),
      assignedAgent: row.assigned_agent ?? "",
      slaDue: slaDue(row.created_at, priority),
      firstResponseAt: row.first_response_at ?? null,
      resolvedAt: row.resolved_at ?? null,
      platform: normalizePlatform(row.platform),
      hasAttachment: Boolean(row.attachment_path),
    };
  });

  return {
    generatedAt,
    liveTickets: tickets,
    trafficTimeline,
    agentQueue: buildAgentQueue(tickets, new Date(generatedAt)),
  };
}
