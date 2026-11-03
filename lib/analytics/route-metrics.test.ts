import { describe, expect, test } from "vitest";
import { buildTriageReviewCases, loadRouteMetrics } from "./route-metrics";
import type { RouteEventRow } from "@/lib/tickets/route-events";

const event = (
  ticket: string,
  from: string | null,
  to: string
): RouteEventRow => ({
  ticket_id: ticket,
  source: from ? "assign" : "claim",
  from_agent_id: from,
  to_agent_id: to,
});

const ticket = (id: string) => ({
  id,
  category: "Network",
  platform: "Windows",
  handoff_reason: "low_confidence",
  ai_recommended_issue_id: null,
  ai_confidence: 0.4,
});

function fakeAdmin(
  tables: Record<string, unknown[]>,
  calls: Array<{ table: string; method: string; args: unknown[] }> = [],
  errorTable?: string
) {
  return {
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "order", "in"]) {
        query[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return query;
        };
      }
      query.range = async (from: number, to: number) => {
        calls.push({ table, method: "range", args: [from, to] });
        if (table === errorTable) return { data: null, error: new Error("x") };
        return { data: (tables[table] ?? []).slice(from, to + 1), error: null };
      };
      query.then = (resolve: (value: unknown) => void) =>
        resolve(
          table === errorTable
            ? { data: null, error: new Error("x") }
            : { data: tables[table] ?? [], error: null }
        );
      return query;
    },
  } as never;
}

describe("buildTriageReviewCases", () => {
  test("lists rerouted tickets with triage metadata, most rerouted first", () => {
    const cases = buildTriageReviewCases(
      [
        event("t-1", null, "a"),
        event("t-2", null, "a"),
        event("t-2", "a", "b"),
        event("t-3", "a", "b"),
        event("t-3", "b", "a"),
        event("t-3", "a", "b"),
      ],
      [ticket("t-2"), ticket("t-3")]
    );
    expect(cases.map((item) => [item.ticketId, item.reroutes])).toEqual([
      ["t-3", 3],
      ["t-2", 1],
    ]);
    expect(cases[0]).toMatchObject({
      pingPong: true,
      category: "Network",
      handoffReason: "low_confidence",
      aiConfidence: 0.4,
    });
    expect(cases[1].pingPong).toBe(false);
  });
});

describe("loadRouteMetrics", () => {
  test("returns null without an organization or when the table is missing", async () => {
    await expect(loadRouteMetrics(fakeAdmin({}), null)).resolves.toBeNull();
    await expect(
      loadRouteMetrics(fakeAdmin({}, [], "ticket_route_events"), "org-1")
    ).resolves.toBeNull();
  });

  test("pages route events, scopes both reads to the organization", async () => {
    const events = [
      ...Array.from({ length: 1000 }, (_, index) =>
        event(`c-${index}`, null, "a")
      ),
      event("t-9", "a", "b"),
    ];
    const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
    const metrics = await loadRouteMetrics(
      fakeAdmin(
        { ticket_route_events: events, tickets: [ticket("t-9")] },
        calls
      ),
      "org-1",
      { windowDays: 7 }
    );
    expect(metrics).toMatchObject({
      windowDays: 7,
      stats: { routedTickets: 1001, reroutedTickets: 1 },
      reviewCases: [{ ticketId: "t-9", reroutes: 1 }],
    });
    expect(
      calls.filter(
        (call) =>
          call.table === "ticket_route_events" && call.method === "range"
      )
    ).toHaveLength(2);
    for (const table of ["ticket_route_events", "tickets"]) {
      expect(calls).toContainEqual({
        table,
        method: "eq",
        args: ["organization_id", "org-1"],
      });
    }
  });
});
