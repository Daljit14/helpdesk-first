import { describe, expect, test, vi } from "vitest";
const supabaseMocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: supabaseMocks.createAdminClient,
}));
import {
  computeResolutionMetrics,
  getGuardrailAggregate,
  getResolutionCenterOverview,
  getResolutionRunDetail,
  getShadowAggregate,
  getShadowOverview,
} from "./resolution-center";

const createQuery = (data: unknown[] | null) => {
  const query: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "gte",
    "order",
    "in",
    "like",
    "limit",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => ({
    data: data?.[0] ?? null,
    error: null,
  }));
  query.then = (
    resolve: (value: { data: unknown[] | null; error: null }) => unknown
  ) => Promise.resolve({ data, error: null }).then(resolve);
  return query;
};

const run = (
  overrides: Partial<
    Parameters<typeof computeResolutionMetrics>[0][number]
  > = {}
) => ({
  id: "run-1",
  ticketId: "ticket-1",
  ticketTitle: "Ticket",
  ticketStatus: "Resolved",
  status: "resolved" as const,
  attempts: 1,
  maxAttempts: 3,
  costCents: 10,
  budgetCents: 50,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  completedAt: "2026-01-01T00:00:11.000Z",
  escalationReason: null,
  initiatedBy: "ai",
  elapsedMs: 10_000,
  plannedCapability: null,
  lastPolicyDecision: null,
  awaiting: null,
  reopened: false,
  ...overrides,
});

describe("computeResolutionMetrics", () => {
  test("guards empty and division cases", () => {
    expect(computeResolutionMetrics([], [], [], [], [])).toMatchObject({
      aiAssigned: 0,
      reopenRate: 0,
      falseResolutionRate: 0,
      medianTimeToVerifiedMs: 0,
      costPerVerifiedCents: 0,
    });
  });

  test("computes statuses, median and capability verification", () => {
    const metrics = computeResolutionMetrics(
      [
        run({
          id: "run-1",
          ticketId: "ticket-1",
          elapsedMs: 10,
          costCents: 10,
        }),
        run({
          id: "run-2",
          ticketId: "ticket-2",
          elapsedMs: 30,
          costCents: 20,
        }),
        run({ id: "run-3", status: "escalated", ticketStatus: "Needs Human" }),
      ],
      [
        {
          runId: "run-1",
          executionId: "execution-1",
          capabilityId: "route_to_department",
          platform: "any",
          status: "succeeded",
        },
        {
          runId: "run-2",
          executionId: "execution-2",
          capabilityId: "route_to_department",
          platform: "any",
          status: "failed",
        },
      ],
      [
        {
          runId: "run-1",
          executionId: "execution-1",
          outcome: "passed",
          userConfirmed: false,
        },
        {
          runId: "run-2",
          executionId: "execution-2",
          outcome: "failed",
          userConfirmed: false,
        },
      ],
      [{ runId: "run-1" }],
      ["ticket-1"]
    );
    expect(metrics).toMatchObject({
      aiAssigned: 3,
      autoResolved: 1,
      escalated: 1,
      verificationFailures: 1,
      rollbacks: 1,
      reopenRate: 0.5,
      falseResolutionRate: 0.5,
      medianTimeToVerifiedMs: 20,
      costPerVerifiedCents: 15,
      byCapability: [
        {
          capabilityId: "route_to_department",
          platform: "any",
          executed: 2,
          verified: 1,
        },
      ],
    });
  });

  test("counts resolved runs without executions as user assisted", () => {
    expect(
      computeResolutionMetrics(
        [run()],
        [],
        [
          {
            runId: "run-1",
            executionId: null,
            outcome: "passed",
            userConfirmed: true,
          },
        ],
        [],
        []
      )
    ).toMatchObject({ userAssisted: 1, autoResolved: 0 });
  });
});

describe("Resolution Center organization boundaries", () => {
  test("scopes shadow overview to the organization", async () => {
    const query = createQuery([]);
    supabaseMocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => query),
    });
    await getShadowOverview({
      userId: "user-1",
      email: "agent@example.com",
      role: "support_agent",
      organizationId: "org-1",
      displayName: null,
      isPlatformAdmin: false,
    });
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  test("rejects shadow aggregate for non-platform admins", async () => {
    await expect(
      getShadowAggregate({
        userId: "user-1",
        email: "agent@example.com",
        role: "org_admin",
        organizationId: "org-1",
        displayName: null,
        isPlatformAdmin: false,
      })
    ).rejects.toThrow("Platform admin access required.");
  });

  test("returns null when the run is not in the session organization", async () => {
    const query = createQuery([]);
    const from = vi.fn(() => query);
    supabaseMocks.createAdminClient.mockReturnValue({ from });
    const result = await getResolutionRunDetail(
      {
        userId: "user-1",
        email: "agent@example.com",
        role: "support_agent",
        organizationId: "org-1",
        displayName: null,
        isPlatformAdmin: false,
      },
      "foreign-run"
    );
    expect(result).toBeNull();
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  test("scopes every overview data query to the organization", async () => {
    const queries = new Map<string, Record<string, unknown>>();
    const from = vi.fn((table: string) => {
      const query = createQuery(
        table === "resolution_runs"
          ? [
              {
                id: "run-1",
                organization_id: "org-1",
                ticket_id: "ticket-1",
                status: "queued",
                attempts: 0,
                max_attempts: 3,
                cost_cents: 0,
                budget_cents: 10,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
                completed_at: null,
                escalation_reason: null,
                initiated_by: "ai",
              },
            ]
          : []
      );
      queries.set(table, query);
      return query;
    });
    supabaseMocks.createAdminClient.mockReturnValue({ from });
    await getResolutionCenterOverview({
      userId: "user-1",
      email: "agent@example.com",
      role: "support_agent",
      organizationId: "org-1",
      displayName: null,
      isPlatformAdmin: false,
    });
    for (const query of queries.values()) {
      expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
    }
  });

  test("platform aggregate reads only guardrail counts", async () => {
    const query = createQuery([
      {
        kind: "guardrail.execution_allowed",
        detail: { reasonCode: "allowed" },
      },
      {
        kind: "guardrail.policy_denied",
        detail: { reasonCode: "policy_denied" },
      },
    ]);
    supabaseMocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => query),
    });
    await expect(
      getGuardrailAggregate({
        userId: "platform-1",
        email: "platform@example.com",
        role: "org_admin",
        organizationId: "org-1",
        displayName: null,
        isPlatformAdmin: true,
      })
    ).resolves.toEqual({
      allowed: 1,
      blocked: 1,
      injectionDetections: 0,
      providerFailures: 0,
      killSwitchEvents: 0,
    });
    expect(query.select).toHaveBeenCalledWith("kind,detail");
    expect(query.select).not.toHaveBeenCalledWith(
      expect.stringContaining("ticket_id")
    );
  });
});
