import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  alertSecurityEvent: vi.fn(),
  readBreakerState: vi.fn(),
  recordBreakerOutcome: vi.fn(),
  readKillSwitches: vi.fn(),
  setKillSwitch: vi.fn(),
  isCapabilityEnabled: vi.fn(),
  getHandler: vi.fn(),
  verifyConsent: vi.fn(),
  transitionRun: vi.fn(),
}));

vi.mock("../alerts", () => ({ alertSecurityEvent: mocks.alertSecurityEvent }));
vi.mock("../breaker", () => ({
  readBreakerState: mocks.readBreakerState,
  recordBreakerOutcome: mocks.recordBreakerOutcome,
}));
vi.mock("../kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
  setKillSwitch: mocks.setKillSwitch,
}));
vi.mock("../capabilities/enablement", () => ({
  isCapabilityEnabled: mocks.isCapabilityEnabled,
}));
vi.mock("../executor/handlers", () => ({ getHandler: mocks.getHandler }));
vi.mock("./consent", () => ({ verifyConsent: mocks.verifyConsent }));
vi.mock("../orchestrator", () => ({ transitionRun: mocks.transitionRun }));

import type { HandlerAdmin } from "../executor/handlers/types";
import type { ResolutionRun } from "../orchestrator";
import type { CapabilityDefinition } from "../capabilities/types";
import { executeThroughGateway, type GatewayRequest } from "./gateway";

const run = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: "ticket-1",
  status: "executing",
  previous_status: "planning",
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
} satisfies ResolutionRun;

const plan = {
  ticketId: "ticket-1",
  diagnosis: { summary: "safe", confidence: 0.9, evidenceIds: ["ticket"] },
  decision: "propose_action" as const,
  capability: { id: "safe_capability", version: 1, parameters: {} },
  verificationMethod: "none",
};

function makeAdmin(
  options: {
    ticket?: boolean;
    executions?: { parameters: unknown; status: string }[];
    replay?: { id: string };
    concurrent?: number;
  } = {}
) {
  const handlerResult = { ok: true, output: { ok: true } };
  const handler = { run: vi.fn(async () => handlerResult) };
  mocks.getHandler.mockReturnValue(handler);
  const from = vi.fn((table: string) => {
    let selection = "";
    const state = {
      data:
        table === "resolution_steps"
          ? { detail: { plannerProvider: "deterministic" } }
          : table === "tickets"
            ? options.ticket === false
              ? null
              : { id: run.ticket_id, organization_id: run.organization_id }
            : null,
      error: null,
    };
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain.select = (value: unknown) => {
      selection = String(value);
      return chain;
    };
    for (const name of ["eq", "in", "order", "limit", "is", "gte", "update"]) {
      chain[name] = () => chain;
    }
    chain.insert = () => chain;
    chain.maybeSingle = async () => {
      if (table === "resolution_steps") return state;
      if (table === "tickets") return state;
      if (table === "capability_executions" && selection === "id,status") {
        return { data: options.replay ?? null, error: null };
      }
      return { data: null, error: null };
    };
    chain.single = async () =>
      table === "capability_executions"
        ? { data: { id: "execution-1" }, error: null }
        : { data: run, error: null };
    chain.then = (...args: unknown[]) => {
      const resolve = args[0] as (value: unknown) => unknown;
      return Promise.resolve({
        data:
          table === "resolution_runs"
            ? Array.from({ length: options.concurrent ?? 0 }, (_, index) => ({
                id: `run-${index}`,
              }))
            : table === "capability_executions"
              ? (options.executions ?? [])
              : [],
        error: null,
      }).then(resolve);
    };
    return chain;
  });
  return { admin: { from } as unknown as HandlerAdmin, handler };
}

function baseCapability(): CapabilityDefinition {
  return {
    id: "safe_capability",
    version: 1,
    platforms: ["any"],
    department: "Security and Audit",
    description: "safe",
    inputSchema: z.object({}),
    preconditions: [],
    riskLevel: "safe",
    consent: "none",
    orgPolicyRequirements: [],
    maxRuntimeMs: 1_000,
    expectedResult: "done",
    verification: "none",
    rollback: "none",
    owner: "test",
    reviewDate: "2099-01-01",
    sideEffects: "read_only",
  };
}

function request(
  overrides: Omit<Partial<GatewayRequest>, "policy" | "capability" | "plan"> & {
    policy?: Partial<GatewayRequest["policy"]>;
    capability?: CapabilityDefinition;
    plan?: GatewayRequest["plan"];
  } = {},
  currentRun: ResolutionRun = run
) {
  const capability = baseCapability();
  const { policy: policyOverride, ...rest } = overrides;
  return {
    run: currentRun,
    plan,
    capability,
    policy: {
      decision: "allow_automatic" as const,
      reasons: [],
      policyVersion: "test",
      auditLabel: "Safe",
      userLabel: "Safe",
      consentSatisfied: false,
      ...policyOverride,
    },
    actor: "ai",
    idempotencyKey: "key-1",
    stepId: "step-1",
    verify: vi.fn(async () => ({ outcome: "pending" as const })),
    ...rest,
  };
}

describe("executeThroughGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    mocks.readKillSwitches.mockResolvedValue({
      global: false,
      organization: false,
      capability: false,
      provider: false,
      anyActive: false,
      reasons: [],
    });
    mocks.readBreakerState.mockResolvedValue({ open: false });
    mocks.isCapabilityEnabled.mockResolvedValue(true);
    mocks.verifyConsent.mockResolvedValue({ ok: true, id: "approval-1" });
    mocks.transitionRun.mockImplementation(
      async (_admin: unknown, value: ResolutionRun, status: string) => ({
        ...value,
        status,
      })
    );
  });

  test.each([
    ["guardrails_not_enforced", { HELP_DESK_GUARDRAILS_ENFORCED: "false" }],
    ["execution_disabled", { HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED: "false" }],
  ])("%s denies before handler invocation", async (code, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { admin, handler } = makeAdmin();
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({ ok: false, code });
    expect(handler.run).not.toHaveBeenCalled();
  });

  test("denies kill switches, breaker, tenant, capability, policy, parameters, and state", async () => {
    const cases = [
      {
        code: "kill_switch_active",
        setup: () =>
          mocks.readKillSwitches.mockResolvedValue({
            anyActive: true,
            reasons: ["provider"],
          }),
      },
      {
        code: "breaker_open",
        setup: () => mocks.readBreakerState.mockResolvedValue({ open: true }),
      },
      {
        code: "tenant_mismatch",
        setup: () => undefined,
        options: { ticket: false },
      },
      {
        code: "capability_disabled",
        setup: () => mocks.isCapabilityEnabled.mockResolvedValue(false),
      },
      {
        code: "policy_denied",
        setup: () => undefined,
        policy: { decision: "deny" as const },
      },
      {
        code: "parameters_invalid",
        setup: () => undefined,
        plan: {
          ...plan,
          capability: { ...plan.capability, parameters: { bad: true } },
        },
        capability: { inputSchema: z.object({ required: z.string() }) },
      },
      {
        code: "invalid_run_state",
        setup: () => undefined,
        currentRun: { ...run, status: "planning" as const },
      },
    ] as Array<{
      code: string;
      setup: () => unknown;
      options?: Parameters<typeof makeAdmin>[0];
      policy?: Partial<GatewayRequest["policy"]>;
      plan?: GatewayRequest["plan"];
      capability?: Partial<CapabilityDefinition>;
      currentRun?: ResolutionRun;
    }>;
    for (const item of cases) {
      vi.clearAllMocks();
      vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
      vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
      mocks.readKillSwitches.mockResolvedValue({
        anyActive: false,
        reasons: [],
      });
      mocks.readBreakerState.mockResolvedValue({ open: false });
      mocks.isCapabilityEnabled.mockResolvedValue(true);
      item.setup();
      const { admin, handler } = makeAdmin(item.options);
      const req = request(
        {
          ...(item.policy ? { policy: item.policy } : {}),
          ...(item.plan ? { plan: item.plan } : {}),
          ...(item.capability
            ? { capability: { ...baseCapability(), ...item.capability } }
            : {}),
        },
        item.currentRun ?? run
      );
      const result = await executeThroughGateway(admin, req);
      expect(result).toMatchObject({ ok: false, code: item.code });
      expect(handler.run).not.toHaveBeenCalled();
    }
  });

  test("uses rate limiting for repeated failures, attempts, budget, and concurrency", async () => {
    const cases = [
      {
        code: "repeated_failure",
        options: { executions: [{ parameters: {}, status: "failed" }] },
      },
      { code: "attempts_exhausted", run: { ...run, attempts: 3 } },
      { code: "budget_exhausted", run: { ...run, budget_cents: 0 } },
      { code: "concurrency_limit", options: { concurrent: 2 } },
    ] as Array<{
      code: string;
      options?: Parameters<typeof makeAdmin>[0];
      run?: ResolutionRun;
    }>;
    for (const item of cases) {
      vi.clearAllMocks();
      vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
      vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
      mocks.readKillSwitches.mockResolvedValue({
        anyActive: false,
        reasons: [],
      });
      mocks.readBreakerState.mockResolvedValue({ open: false });
      mocks.isCapabilityEnabled.mockResolvedValue(true);
      const { admin, handler } = makeAdmin(item.options);
      const result = await executeThroughGateway(
        admin,
        request({}, item.run ?? run)
      );
      expect(result).toMatchObject({ ok: false, code: item.code });
      expect(handler.run).not.toHaveBeenCalled();
    }
  });

  test("consumes bound consent immediately before the handler", async () => {
    const { admin, handler } = makeAdmin();
    const capability = {
      ...request().capability,
      consent: "user" as const,
    };
    const result = await executeThroughGateway(
      admin,
      request({
        capability,
        policy: {
          ...request().policy,
          decision: "require_user_consent",
          consent: { type: "user_consent", userId: "user-1" },
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(mocks.verifyConsent).toHaveBeenCalled();
    expect(handler.run).toHaveBeenCalledTimes(1);
  });

  test("replays an existing execution without calling the handler", async () => {
    const { admin, handler } = makeAdmin({ replay: { id: "execution-1" } });
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({ ok: true });
    expect(handler.run).not.toHaveBeenCalled();
  });

  test("runs a handler once and records the estimated cost", async () => {
    const { admin, handler } = makeAdmin();
    const result = await executeThroughGateway(
      admin,
      request({
        capability: { ...request().capability, estimatedCostCents: 7 },
      })
    );
    expect(result.ok).toBe(true);
    expect(handler.run).toHaveBeenCalledTimes(1);
    expect(mocks.recordBreakerOutcome).toHaveBeenCalled();
    expect(mocks.readKillSwitches).toHaveBeenCalledWith(
      admin,
      "org-1",
      "safe_capability",
      "deterministic"
    );
  });

  test("blocks when the planner provider switch flips before execution", async () => {
    const { admin, handler } = makeAdmin();
    mocks.readKillSwitches.mockResolvedValue({
      global: false,
      organization: false,
      capability: false,
      provider: true,
      anyActive: true,
      reasons: ["provider"],
    });
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({ ok: false, code: "kill_switch_active" });
    expect(handler.run).not.toHaveBeenCalled();
    expect(mocks.readKillSwitches).toHaveBeenCalledWith(
      admin,
      "org-1",
      "safe_capability",
      "deterministic"
    );
  });
});
