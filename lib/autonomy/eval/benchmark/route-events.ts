import {
  recordRouteEvent,
  type RouteEventRow,
} from "@/lib/tickets/route-events";

export type RouteEventEvalCase = {
  caseId: string;
  routeEventsOk: boolean;
};

const FLAG = "HELP_DESK_TICKET_ROUTE_EVENTS_ENABLED";

function memoryAdmin(rows: RouteEventRow[]) {
  return {
    from: () => {
      const query = {
        insert: async (value: Record<string, unknown>) => {
          rows.push({
            ticket_id: value.ticket_id as string,
            source: value.source as RouteEventRow["source"],
            from_agent_id: (value.from_agent_id as string | null) ?? null,
            to_agent_id: (value.to_agent_id as string | null) ?? null,
          });
          return { error: null };
        },
        select: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: rows, error: null }),
      };
      return query;
    },
  } as never;
}

const base = {
  organizationId: "org-eval",
  ticketId: "ticket-eval",
  actorId: "staff-eval",
};

async function withFlag<T>(value: string | undefined, run: () => Promise<T>) {
  const previous = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
}

export async function runRouteEventEvalCases(): Promise<RouteEventEvalCase[]> {
  const claim = await withFlag("true", async () => {
    const rows: RouteEventRow[] = [];
    const result = await recordRouteEvent(memoryAdmin(rows), {
      ...base,
      source: "claim",
      fromAgentId: null,
      toAgentId: "agent-a",
    });
    return result.recorded && rows.length === 1 && rows[0].source === "claim";
  });

  const reassign = await withFlag("true", async () => {
    const rows: RouteEventRow[] = [];
    const result = await recordRouteEvent(memoryAdmin(rows), {
      ...base,
      source: "assign",
      fromAgentId: "agent-a",
      toAgentId: "agent-b",
    });
    return (
      result.recorded &&
      rows[0]?.from_agent_id === "agent-a" &&
      rows[0]?.to_agent_id === "agent-b"
    );
  });

  const pingPong = await withFlag("true", async () => {
    const rows: RouteEventRow[] = [];
    const admin = memoryAdmin(rows);
    const owners = ["agent-a", "agent-b", "agent-a", "agent-b"];
    const alerts: boolean[] = [];
    for (let index = 1; index < owners.length; index += 1) {
      const result = await recordRouteEvent(admin, {
        ...base,
        source: "assign",
        fromAgentId: owners[index - 1],
        toAgentId: owners[index],
      });
      alerts.push(result.pingPong);
    }
    return alerts.join(",") === "false,false,true";
  });

  const flagOff = await withFlag(undefined, async () => {
    const rows: RouteEventRow[] = [];
    const result = await recordRouteEvent(memoryAdmin(rows), {
      ...base,
      source: "assign",
      fromAgentId: "agent-a",
      toAgentId: "agent-b",
    });
    return !result.recorded && rows.length === 0;
  });

  return [
    { caseId: "route_events_claim_recorded", routeEventsOk: claim },
    { caseId: "route_events_reassign_recorded", routeEventsOk: reassign },
    { caseId: "route_events_ping_pong_alert", routeEventsOk: pingPong },
    { caseId: "route_events_flag_off_records_nothing", routeEventsOk: flagOff },
  ];
}
