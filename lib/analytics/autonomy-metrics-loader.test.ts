import { afterEach, describe, expect, test, vi } from "vitest";
import { getExcludedRecordIds } from "@/lib/admin/record-exclusions";
import type { AdminSession } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAutonomyMetrics } from "./autonomy-metrics";

vi.mock("@/lib/admin/record-exclusions", () => ({
  getExcludedRecordIds: vi.fn(),
}));
vi.mock("@/lib/security/ticket-crypto", () => ({
  decryptAgentText: async (
    _admin: unknown,
    _orgId: string,
    _table: string,
    _field: string,
    value: string | null
  ) => value,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const queryLog: Array<{ table: string; operation: string; values: unknown[] }> =
  [];
let investigationTurns: unknown[] = [];
let investigationTurnsError: { code?: string; message?: string } | null = null;

class MockQuery {
  data: unknown[];
  error: { code?: string; message?: string } | null;

  constructor(
    private readonly table: string,
    private readonly selects: string[]
  ) {
    const now = new Date().toISOString();
    this.error =
      table === "ticket_investigation_turns" ? investigationTurnsError : null;
    this.data =
      table === "agent_sessions"
        ? [
            {
              id: "session-1",
              requester_id: "requester-1",
              status: "resolved",
              started_at: now,
              ended_at: now,
              last_user_message: null,
              resolution_summary: null,
              backing_ticket_id: null,
              escalation_ticket_id: null,
              cost_micros: 1234,
            },
          ]
        : table === "ticket_investigation_turns"
          ? investigationTurns
          : [];
  }

  select(columns: string) {
    queryLog.push({
      table: this.table,
      operation: "select",
      values: [columns],
    });
    if (this.table === "agent_sessions") this.selects.push(columns);
    return this;
  }

  eq(...values: unknown[]) {
    queryLog.push({ table: this.table, operation: "eq", values });
    return this;
  }

  gte(...values: unknown[]) {
    queryLog.push({ table: this.table, operation: "gte", values });
    return this;
  }

  neq() {
    return this;
  }

  order() {
    return this;
  }

  in() {
    return this;
  }
}

const session = {
  organizationId: "org-1",
  role: "org_admin",
} as AdminSession;

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  queryLog.length = 0;
  investigationTurns = [];
  investigationTurnsError = null;
});

describe("getAutonomyMetrics cost selection", () => {
  test.each([
    [
      "false",
      "id,requester_id,status,started_at,ended_at,last_user_message,resolution_summary,backing_ticket_id,escalation_ticket_id",
    ],
    [
      "true",
      "id,requester_id,status,started_at,ended_at,last_user_message,resolution_summary,backing_ticket_id,escalation_ticket_id,cost_micros",
    ],
  ])(
    "selects the appropriate columns when tracking is %s",
    async (enabled, expectedSelect) => {
      vi.stubEnv("HELP_DESK_AGENT_COST_TRACKING_ENABLED", enabled);
      vi.mocked(getExcludedRecordIds).mockResolvedValue(new Set());
      const selects: string[] = [];
      const admin = {
        from: (table: string) => new MockQuery(table, selects),
      };
      vi.mocked(createAdminClient).mockReturnValue(admin as never);

      const metrics = await getAutonomyMetrics(session);

      expect(selects).toEqual([expectedSelect]);
      expect(metrics.costTracking).toBe(enabled === "true");
      expect(metrics.totalCostMicros).toBe(enabled === "true" ? 1234 : 0);
    }
  );
});

describe("getAutonomyMetrics clarification metrics", () => {
  function setAdmin() {
    vi.mocked(getExcludedRecordIds).mockResolvedValue(
      new Set(["ticket-excluded"])
    );
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => new MockQuery(table, []),
    } as never);
  }

  test("does not query investigation turns while the feature flag is off", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "false");
    setAdmin();

    const metrics = await getAutonomyMetrics(session);

    expect(
      queryLog.some(({ table }) => table === "ticket_investigation_turns")
    ).toBe(false);
    expect(metrics).toMatchObject({
      orgEnvironment: false,
      clarifiedTickets: 0,
      avgClarifyingQuestions: null,
    });
  });

  test("queries bounded organization turns and computes distinct question metrics", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "true");
    investigationTurns = [
      { ticket_id: "ticket-1", question_ids: ["q1", "q1"] },
      { ticket_id: "ticket-1", question_ids: ["q2"] },
      { ticket_id: "ticket-2", question_ids: ["q3"] },
      { ticket_id: "ticket-excluded", question_ids: ["q4"] },
    ];
    setAdmin();

    const metrics = await getAutonomyMetrics(session);

    expect(metrics).toMatchObject({
      orgEnvironment: true,
      clarifiedTickets: 2,
      avgClarifyingQuestions: 1.5,
    });
    expect(
      queryLog.find(
        ({ table, operation }) =>
          table === "ticket_investigation_turns" && operation === "select"
      )?.values
    ).toEqual(["ticket_id,question_ids"]);
    expect(queryLog).toContainEqual({
      table: "ticket_investigation_turns",
      operation: "eq",
      values: ["organization_id", "org-1"],
    });
    expect(queryLog).toContainEqual({
      table: "ticket_investigation_turns",
      operation: "gte",
      values: ["created_at", expect.any(String)],
    });
  });

  test("treats a missing turns table as no data and throws other errors", async () => {
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "true");
    investigationTurnsError = {
      code: "42P01",
      message: "ticket_investigation_turns does not exist",
    };
    setAdmin();

    await expect(getAutonomyMetrics(session)).resolves.toMatchObject({
      orgEnvironment: true,
      clarifiedTickets: 0,
      avgClarifyingQuestions: null,
    });

    investigationTurnsError = { code: "XX000", message: "query failed" };
    await expect(getAutonomyMetrics(session)).rejects.toMatchObject({
      code: "XX000",
    });
  });
});
