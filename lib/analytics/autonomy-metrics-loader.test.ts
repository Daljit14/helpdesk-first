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
let deviceJobsError: { code?: string; message?: string } | null = null;
let sessionBackingTicketId: string | null = null;
let queryData: Record<string, unknown[]> = {};

class MockQuery {
  data: unknown[];
  error: { code?: string; message?: string } | null;

  constructor(
    private readonly table: string,
    private readonly selects: string[]
  ) {
    const now = new Date(Date.now() - 1000).toISOString();
    this.error =
      table === "ticket_investigation_turns"
        ? investigationTurnsError
        : table === "device_jobs"
          ? deviceJobsError
          : null;
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
              backing_ticket_id: sessionBackingTicketId,
              escalation_ticket_id: null,
              verified_execution_id: "execution-1",
              user_confirmed_at: now,
              cost_micros: 1234,
            },
          ]
        : table === "ticket_investigation_turns"
          ? investigationTurns
          : (queryData[table] ?? []);
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

  in(...values: unknown[]) {
    queryLog.push({
      table: this.table,
      operation: "in",
      values,
    });
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
  deviceJobsError = null;
  sessionBackingTicketId = null;
  queryData = {};
});

describe("getAutonomyMetrics cost selection", () => {
  test.each([
    [
      "false",
      "id,requester_id,status,started_at,ended_at,last_user_message,resolution_summary,backing_ticket_id,escalation_ticket_id,verified_execution_id,user_confirmed_at",
    ],
    [
      "true",
      "id,requester_id,status,started_at,ended_at,last_user_message,resolution_summary,backing_ticket_id,escalation_ticket_id,verified_execution_id,user_confirmed_at,cost_micros",
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

  test("loads v2 category, capability, reports, and device-job data", async () => {
    sessionBackingTicketId = "ticket-1";
    queryData.tickets = [
      {
        id: "ticket-1",
        user_id: "requester-1",
        category: "network",
        created_at: new Date().toISOString(),
        status: "Resolved",
        resolved_at: null,
      },
    ];
    queryData.agent_steps = [
      {
        session_id: "session-1",
        kind: "action_executing",
        tool_name: null,
        result_summary: null,
        seq: 1,
        capability_id: "device_flush_dns",
      },
    ];
    queryData.ticket_actions = [
      {
        ticket_id: "ticket-1",
        agent_id: null,
        created_at: new Date().toISOString(),
      },
    ];
    queryData.device_jobs = [{ ticket_id: "ticket-1", device_id: "device-1" }];
    vi.mocked(getExcludedRecordIds).mockResolvedValue(new Set());
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => new MockQuery(table, []),
    } as never);

    const metrics = await getAutonomyMetrics(session);

    expect(metrics.v2).toMatchObject({
      outcomes: { ai_resolved: 1 },
      byCategory: [
        expect.objectContaining({
          key: "network",
          sessions: 1,
          aiResolved: 1,
        }),
      ],
      byCapability: [
        expect.objectContaining({ key: "device_flush_dns", sessions: 1 }),
      ],
    });
    expect(queryLog).toContainEqual({
      table: "tickets",
      operation: "select",
      values: ["id,user_id,category,created_at"],
    });
    expect(queryLog).toContainEqual({
      table: "device_jobs",
      operation: "select",
      values: ["ticket_id,device_id"],
    });
  });

  test("tolerates a missing device_jobs table", async () => {
    sessionBackingTicketId = "ticket-1";
    deviceJobsError = {
      code: "42P01",
      message: "device_jobs does not exist",
    };
    vi.mocked(getExcludedRecordIds).mockResolvedValue(new Set());
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => new MockQuery(table, []),
    } as never);

    await expect(getAutonomyMetrics(session)).resolves.toMatchObject({
      sessions: 1,
      v2: { sessions: 1 },
    });
  });

  test("only exposes excluded records when showExcluded is requested by an org admin", async () => {
    vi.mocked(getExcludedRecordIds).mockResolvedValue(new Set());
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => new MockQuery(table, []),
    } as never);

    await getAutonomyMetrics(
      { ...session, role: "support_agent" } as AdminSession,
      { showExcluded: true }
    );
    expect(getExcludedRecordIds).toHaveBeenCalledOnce();

    vi.mocked(getExcludedRecordIds).mockClear();
    await getAutonomyMetrics(session, { showExcluded: true });
    expect(getExcludedRecordIds).not.toHaveBeenCalled();
  });
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
