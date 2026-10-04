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

class MockQuery {
  data: unknown[];
  error = null;

  constructor(
    private readonly table: string,
    private readonly selects: string[]
  ) {
    const now = new Date().toISOString();
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
        : [];
  }

  select(columns: string) {
    if (this.table === "agent_sessions") this.selects.push(columns);
    return this;
  }

  eq() {
    return this;
  }

  gte() {
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
