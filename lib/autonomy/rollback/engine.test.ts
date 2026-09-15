import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transitionRun: vi.fn(),
  escalateRun: vi.fn(),
}));

vi.mock("../orchestrator", () => ({
  transitionRun: mocks.transitionRun,
  escalateRun: mocks.escalateRun,
  writeRunEvent: vi.fn(),
}));

import { rollbackExecution } from "./engine";
import { assertTransition } from "../state-machine";

const run = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: "ticket-1",
  status: "verifying" as const,
  previous_status: null,
  attempts: 1,
  max_attempts: 3,
  cost_cents: 0,
  budget_cents: 50,
  deadline_at: new Date(Date.now() + 60_000).toISOString(),
  initiated_by: "ai",
  planner_version: null,
  model: null,
  prompt_version: null,
  policy_version: null,
  escalation_reason: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,
};

function adminFor(
  execution: Record<string, unknown> | null,
  existing: Record<string, unknown> | null = null
) {
  const queries: Record<string, ReturnType<typeof query>> = {};
  function query(table: string) {
    const chain = {
      data:
        table === "capability_executions"
          ? execution
          : table === "rollback_runs"
            ? existing
            : null,
      error: null,
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data:
          table === "capability_executions"
            ? execution
            : table === "rollback_runs"
              ? existing
              : null,
        error: null,
      })),
      insert: vi.fn(() => chain),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return chain;
  }
  return {
    from: vi.fn((table: string) => {
      queries[table] ??= query(table);
      return queries[table];
    }),
    queries,
  };
}

describe("rollback execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transitionRun.mockImplementation(async (_admin, value, to) => {
      assertTransition(value.status, to);
      return { ...value, status: to };
    });
    mocks.escalateRun.mockImplementation(async (_admin, value, reason) => ({
      ...value,
      status: "escalated",
      escalation_reason: reason,
    }));
  });

  test("always escalates after supported rollback and never resolves", async () => {
    const admin = adminFor({
      id: "execution-1",
      capability_id: "route_to_department",
      capability_version: 1,
      parameters: { department: "network" },
    });
    const result = await rollbackExecution(admin as never, run, "execution-1");
    expect(result?.status).toBe("escalated");
    expect(mocks.transitionRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "verifying" }),
      "rolling_back",
      expect.anything()
    );
    expect(mocks.escalateRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "rolling_back" }),
      "verification_failed"
    );
    expect(mocks.transitionRun).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "resolved",
      expect.anything()
    );
  });

  test("unsupported rollback is recorded and escalated", async () => {
    const admin = adminFor({
      id: "execution-1",
      capability_id: "search_approved_knowledge",
      capability_version: 1,
      parameters: {},
    });
    const result = await rollbackExecution(admin as never, run, "execution-1");
    expect(result?.status).toBe("escalated");
    expect(admin.queries.rollback_runs.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "unsupported" })
    );
  });

  test("existing rollback run skips handler and escalates", async () => {
    const admin = adminFor(
      {
        id: "execution-1",
        capability_id: "route_to_department",
        capability_version: 1,
        parameters: { department: "network" },
      },
      { id: "rollback-1", status: "succeeded" }
    );
    await expect(
      rollbackExecution(admin as never, run, "execution-1")
    ).resolves.toMatchObject({ status: "escalated" });
  });
});
