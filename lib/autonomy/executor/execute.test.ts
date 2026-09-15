import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transitionRun: vi.fn(),
  resolutionStepPosition: vi.fn(
    (attempts: number, kind: "plan" | "policy" | "execute") =>
      attempts * 3 + { plan: 0, policy: 1, execute: 2 }[kind]
  ),
  isCapabilityEnabled: vi.fn(),
  readKillSwitches: vi.fn(),
  recordPolicyDecision: vi.fn(),
  decidePolicy: vi.fn(),
  getHandler: vi.fn(),
  snapshotEvidence: vi.fn(),
  isEvidenceEngineEnabled: vi.fn(),
}));

vi.mock("../orchestrator", () => ({
  transitionRun: mocks.transitionRun,
  resolutionStepPosition: mocks.resolutionStepPosition,
}));
vi.mock("../capabilities/enablement", () => ({
  isCapabilityEnabled: mocks.isCapabilityEnabled,
}));
vi.mock("../kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
}));
vi.mock("../policy/record", () => ({
  recordPolicyDecision: mocks.recordPolicyDecision,
}));
vi.mock("../policy/engine", () => ({
  decidePolicy: mocks.decidePolicy,
}));
vi.mock("./handlers", () => ({
  getHandler: mocks.getHandler,
}));
vi.mock("@/lib/evidence/snapshot", () => ({
  snapshotEvidence: mocks.snapshotEvidence,
}));
vi.mock("@/lib/admin/flags", () => ({
  isEvidenceEngineEnabled: mocks.isEvidenceEngineEnabled,
}));

import { executePlan, verifyExecution } from "./execute";
import { assertTransition } from "../state-machine";

const run = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: "00000000-0000-4000-8000-000000000001",
  status: "planning" as const,
  previous_status: null,
  attempts: 0,
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

function admin(
  baseRun: Omit<typeof run, "status"> & {
    status: "planning" | "awaiting_consent";
  } = run
) {
  const query = (table: string) => {
    const state = {
      data:
        table === "tickets"
          ? { platform: "Windows", category: null }
          : table === "resolution_steps"
            ? { id: "step-1", detail: {} }
            : table === "resolution_runs"
              ? {
                  ...baseRun,
                  status: "executing",
                  attempts: 1,
                }
              : table === "capability_executions"
                ? null
                : table === "organization_autonomy_policies"
                  ? null
                  : null,
      error: null,
    };
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of [
      "select",
      "eq",
      "in",
      "gte",
      "order",
      "limit",
      "insert",
      "update",
    ]) {
      chain[name] = () => chain;
    }
    chain.maybeSingle = async () => state;
    chain.single = async () => ({
      data:
        table === "capability_executions"
          ? { id: "execution-1" }
          : table === "resolution_steps"
            ? { id: "step-1" }
            : state.data,
      error: null,
    });
    chain.then = ((resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)) as (
      ...args: unknown[]
    ) => unknown;
    return chain;
  };
  return {
    from: vi.fn((table: string) => query(table)),
  };
}

const plan = {
  diagnosis: "A matching approved guide may help.",
  capabilityId: "search_approved_knowledge",
  capabilityVersion: 1,
  parameters: {
    ticketId: "00000000-0000-4000-8000-000000000001",
    query: "display issue",
  },
  expectedEvidence: ["Matching guide is listed."],
};

describe("executePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_CAPABILITY_REGISTRY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_CAP_SEARCH_APPROVED_KNOWLEDGE_ENABLED", "true");
    mocks.isCapabilityEnabled.mockResolvedValue(true);
    mocks.readKillSwitches.mockResolvedValue({
      global: false,
      organization: false,
      capability: false,
      anyActive: false,
      reasons: [],
    });
    mocks.isEvidenceEngineEnabled.mockReturnValue(false);
    mocks.recordPolicyDecision.mockResolvedValue({ ok: true, id: "policy-1" });
    mocks.decidePolicy.mockReturnValue({
      decision: "allow_automatic",
      reasons: ["test"],
      policyVersion: "test",
      auditLabel: "Safe",
      userLabel: "Safe",
    });
    mocks.getHandler.mockReturnValue({
      run: vi.fn(async () => ({ ok: true, output: { matches: 1 } })),
    });
    mocks.transitionRun.mockImplementation(async (_admin, value, to) => {
      assertTransition(value.status, to);
      return { ...value, status: to };
    });
  });

  test("runs a safe plan through verification", async () => {
    const result = await executePlan(admin() as never, run, plan);
    expect(result?.status).toBe("verifying");
    expect(mocks.getHandler).toHaveBeenCalledWith(
      "search_approved_knowledge",
      1
    );
    expect(mocks.transitionRun).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "resolved",
      expect.anything()
    );
  });

  test("granted consent resumes from awaiting_consent through execution", async () => {
    const awaitingConsent = { ...run, status: "awaiting_consent" as const };
    const result = await executePlan(
      admin(awaitingConsent) as never,
      awaitingConsent,
      plan
    );
    expect(result?.status).toBe("verifying");
    expect(mocks.transitionRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "awaiting_consent" }),
      "executing",
      expect.anything()
    );
  });

  test("rejects shell-string parameters before invoking a handler", async () => {
    const result = await executePlan(admin() as never, run, {
      ...plan,
      parameters: { ticketId: run.ticket_id, query: "run powershell" },
    });
    expect(result?.status).toBe("escalated");
    expect(mocks.getHandler).not.toHaveBeenCalled();
  });

  test("keeps the verification seam pending when the engine is disabled", async () => {
    vi.stubEnv("HELP_DESK_VERIFICATION_ENGINE_ENABLED", "false");
    await expect(
      verifyExecution({ admin: admin() as never, run, executionId: null })
    ).resolves.toEqual({ outcome: "pending" });
  });
});
