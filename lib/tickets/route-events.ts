import { isTicketRouteEventsEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";

export const PING_PONG_THRESHOLD = 3;

export type RouteEventSource = "claim" | "assign";

export type RouteEventRow = {
  ticket_id: string;
  source: RouteEventSource;
  from_agent_id: string | null;
  to_agent_id: string | null;
};

export type RerouteStats = {
  routedTickets: number;
  reroutedTickets: number;
  rerouteRate: number;
  pingPongTicketIds: string[];
};

type Admin = ReturnType<typeof createAdminClient>;

/** A reroute is a change of owner on a ticket that already had one. */
export function isReroute(row: RouteEventRow): boolean {
  return row.from_agent_id !== null && row.from_agent_id !== row.to_agent_id;
}

export function computeRerouteStats(rows: RouteEventRow[]): RerouteStats {
  const reroutes = new Map<string, number>();
  const routed = new Set<string>();
  for (const row of rows) {
    routed.add(row.ticket_id);
    if (isReroute(row)) {
      reroutes.set(row.ticket_id, (reroutes.get(row.ticket_id) ?? 0) + 1);
    }
  }
  const pingPongTicketIds = [...reroutes]
    .filter(([, count]) => count >= PING_PONG_THRESHOLD)
    .map(([ticketId]) => ticketId)
    .sort();
  return {
    routedTickets: routed.size,
    reroutedTickets: reroutes.size,
    rerouteRate: routed.size ? reroutes.size / routed.size : 0,
    pingPongTicketIds,
  };
}

/**
 * Records one ownership change. Never throws: routing history must not
 * block the claim/assign action that triggered it. Returns whether the
 * ticket just reached the ping-pong threshold.
 */
export async function recordRouteEvent(
  admin: Admin,
  event: {
    organizationId: string;
    ticketId: string;
    source: RouteEventSource;
    fromAgentId: string | null;
    toAgentId: string;
    actorId: string;
  }
): Promise<{ recorded: boolean; pingPong: boolean }> {
  if (!isTicketRouteEventsEnabled())
    return { recorded: false, pingPong: false };
  try {
    const { error } = await admin.from("ticket_route_events").insert({
      organization_id: event.organizationId,
      ticket_id: event.ticketId,
      source: event.source,
      from_agent_id: event.fromAgentId,
      to_agent_id: event.toAgentId,
      actor_id: event.actorId,
    });
    if (error) throw error;
    if (!event.fromAgentId || event.fromAgentId === event.toAgentId)
      return { recorded: true, pingPong: false };
    const { data, error: readError } = await admin
      .from("ticket_route_events")
      .select("ticket_id,source,from_agent_id,to_agent_id")
      .eq("organization_id", event.organizationId)
      .eq("ticket_id", event.ticketId);
    if (readError) throw readError;
    const count = ((data ?? []) as RouteEventRow[]).filter(isReroute).length;
    return { recorded: true, pingPong: count === PING_PONG_THRESHOLD };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "tickets.route_event.error",
        ticketId: event.ticketId,
        message: error instanceof Error ? error.message : "unknown",
      })
    );
    return { recorded: false, pingPong: false };
  }
}
