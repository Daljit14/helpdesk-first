import type { createAdminClient } from "@/lib/supabase/admin";
import {
  computeRerouteStats,
  isReroute,
  PING_PONG_THRESHOLD,
  type RerouteStats,
  type RouteEventRow,
} from "@/lib/tickets/route-events";

type Admin = ReturnType<typeof createAdminClient>;

const PAGE_SIZE = 1000;
const TICKET_CHUNK = 200;

export type TriageReviewCase = {
  ticketId: string;
  reroutes: number;
  pingPong: boolean;
  category: string | null;
  platform: string | null;
  handoffReason: string | null;
  aiRecommendedIssueId: string | null;
  aiConfidence: number | null;
};

export type RouteMetrics = {
  windowDays: number;
  stats: RerouteStats;
  reviewCases: TriageReviewCase[];
};

type TicketRow = {
  id: string;
  category: string | null;
  platform: string | null;
  handoff_reason: string | null;
  ai_recommended_issue_id: string | null;
  ai_confidence: number | null;
};

/**
 * Rerouted tickets are triage misses: each one becomes a review case so staff
 * corrections can be turned into triage evaluation cases. Metadata only; no
 * ticket text leaves the ticket.
 */
export function buildTriageReviewCases(
  rows: RouteEventRow[],
  tickets: TicketRow[]
): TriageReviewCase[] {
  const reroutes = new Map<string, number>();
  for (const row of rows) {
    if (isReroute(row))
      reroutes.set(row.ticket_id, (reroutes.get(row.ticket_id) ?? 0) + 1);
  }
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  return [...reroutes]
    .map(([ticketId, count]) => {
      const ticket = byId.get(ticketId);
      return {
        ticketId,
        reroutes: count,
        pingPong: count >= PING_PONG_THRESHOLD,
        category: ticket?.category ?? null,
        platform: ticket?.platform ?? null,
        handoffReason: ticket?.handoff_reason ?? null,
        aiRecommendedIssueId: ticket?.ai_recommended_issue_id ?? null,
        aiConfidence: ticket?.ai_confidence ?? null,
      };
    })
    .sort(
      (left, right) =>
        right.reroutes - left.reroutes ||
        left.ticketId.localeCompare(right.ticketId)
    );
}

export async function loadRouteMetrics(
  admin: Admin,
  organizationId: string | null,
  options: { windowDays?: number } = {}
): Promise<RouteMetrics | null> {
  if (!organizationId) return null;
  const windowDays = Math.min(
    365,
    Math.max(1, Math.trunc(options.windowDays ?? 30))
  );
  const from = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  try {
    const rows: RouteEventRow[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const { data, error } = await admin
        .from("ticket_route_events")
        .select("id,ticket_id,source,from_agent_id,to_agent_id")
        .eq("organization_id", organizationId)
        .gte("created_at", from)
        .order("id")
        .range(start, start + PAGE_SIZE - 1);
      if (error || !data) return null;
      rows.push(...(data as RouteEventRow[]));
      if (data.length < PAGE_SIZE) break;
    }
    const rerouted = [
      ...new Set(rows.filter(isReroute).map((row) => row.ticket_id)),
    ];
    const tickets: TicketRow[] = [];
    for (let start = 0; start < rerouted.length; start += TICKET_CHUNK) {
      const { data, error } = await admin
        .from("tickets")
        .select(
          "id,category,platform,handoff_reason,ai_recommended_issue_id,ai_confidence"
        )
        .eq("organization_id", organizationId)
        .in("id", rerouted.slice(start, start + TICKET_CHUNK));
      if (error || !data) return null;
      tickets.push(...(data as TicketRow[]));
    }
    return {
      windowDays,
      stats: computeRerouteStats(rows),
      reviewCases: buildTriageReviewCases(rows, tickets),
    };
  } catch {
    return null;
  }
}
