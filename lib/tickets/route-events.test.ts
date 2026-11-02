import { afterEach, describe, expect, test, vi } from "vitest";
import {
  computeRerouteStats,
  isReroute,
  PING_PONG_THRESHOLD,
  recordRouteEvent,
  type RouteEventRow,
} from "./route-events";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const row = (
  ticket: string,
  from: string | null,
  to: string | null,
  source: RouteEventRow["source"] = "assign"
): RouteEventRow => ({
  ticket_id: ticket,
  source,
  from_agent_id: from,
  to_agent_id: to,
});

function fakeAdmin(
  existing: RouteEventRow[],
  options: { insertError?: unknown } = {}
) {
  const inserts: Record<string, unknown>[] = [];
  const admin = {
    from: () => {
      const query = {
        insert: async (value: Record<string, unknown>) => {
          if (options.insertError) return { error: options.insertError };
          inserts.push(value);
          existing.push(
            row(
              value.ticket_id as string,
              value.from_agent_id as string | null,
              value.to_agent_id as string | null,
              value.source as RouteEventRow["source"]
            )
          );
          return { error: null };
        },
        select: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: existing, error: null }),
      };
      return query;
    },
  };
  return { admin: admin as never, inserts };
}

const base = {
  organizationId: "org-1",
  ticketId: "t-1",
  source: "assign" as const,
  actorId: "admin-1",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isReroute", () => {
  test("first ownership is not a reroute; a change of owner is", () => {
    expect(isReroute(row("t", null, "a", "claim"))).toBe(false);
    expect(isReroute(row("t", "a", "a"))).toBe(false);
    expect(isReroute(row("t", "a", "b"))).toBe(true);
  });
});

describe("computeRerouteStats", () => {
  test("counts rerouted tickets and flags ping-pong at the threshold", () => {
    const rows = [
      row("t-1", null, "a", "claim"),
      row("t-2", null, "a", "claim"),
      row("t-2", "a", "b"),
      row("t-3", null, "a", "claim"),
      row("t-3", "a", "b"),
      row("t-3", "b", "a"),
      row("t-3", "a", "b"),
    ];
    expect(computeRerouteStats(rows)).toEqual({
      routedTickets: 3,
      reroutedTickets: 2,
      rerouteRate: 2 / 3,
      pingPongTicketIds: ["t-3"],
    });
  });

  test("empty history has a zero rate", () => {
    expect(computeRerouteStats([])).toMatchObject({
      routedTickets: 0,
      rerouteRate: 0,
    });
  });
});

describe("recordRouteEvent", () => {
  test("does nothing while the flag is off", async () => {
    const { admin, inserts } = fakeAdmin([]);
    await expect(
      recordRouteEvent(admin, { ...base, fromAgentId: null, toAgentId: "a" })
    ).resolves.toEqual({ recorded: false, pingPong: false });
    expect(inserts).toHaveLength(0);
  });

  test("records the change and reports ping-pong exactly once", async () => {
    vi.stubEnv("HELP_DESK_TICKET_ROUTE_EVENTS_ENABLED", "true");
    const history = [row("t-1", null, "a", "claim")];
    const { admin, inserts } = fakeAdmin(history);
    const owners = ["a", "b", "a", "b", "a"];
    const results = [];
    for (let index = 1; index < owners.length; index += 1) {
      results.push(
        await recordRouteEvent(admin, {
          ...base,
          fromAgentId: owners[index - 1],
          toAgentId: owners[index],
        })
      );
    }
    expect(inserts).toHaveLength(4);
    expect(inserts[0]).toMatchObject({
      organization_id: "org-1",
      ticket_id: "t-1",
      source: "assign",
      from_agent_id: "a",
      to_agent_id: "b",
      actor_id: "admin-1",
    });
    expect(results.map((result) => result.pingPong)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(PING_PONG_THRESHOLD).toBe(3);
  });

  test("fails open when the insert errors", async () => {
    vi.stubEnv("HELP_DESK_TICKET_ROUTE_EVENTS_ENABLED", "true");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin } = fakeAdmin([], { insertError: new Error("missing") });
    await expect(
      recordRouteEvent(admin, { ...base, fromAgentId: "a", toAgentId: "b" })
    ).resolves.toEqual({ recorded: false, pingPong: false });
    expect(warn).toHaveBeenCalled();
  });
});
