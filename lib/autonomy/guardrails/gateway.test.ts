import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
  checkHourlyLimits: vi.fn(),
  recordBlastRadiusOutcome: vi.fn(),
  isOrganizationPrivileged: vi.fn(),
  loadAccountRiskFacts: vi.fn(),
  loadStaffVerification: vi.fn(),
  getIdentityBinding: vi.fn(),
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
vi.mock("../blast-radius", () => ({
  checkHourlyLimits: mocks.checkHourlyLimits,
  recordBlastRadiusOutcome: mocks.recordBlastRadiusOutcome,
}));
vi.mock("@/lib/identity/risk-server", () => ({
  isOrganizationPrivileged: mocks.isOrganizationPrivileged,
  loadAccountRiskFacts: mocks.loadAccountRiskFacts,
}));
vi.mock("@/lib/identity/staff-verification", () => ({
  loadStaffVerification: mocks.loadStaffVerification,
}));
vi.mock("../connectors/binding", () => ({
  getIdentityBinding: mocks.getIdentityBinding,
}));

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
    globalCount?: number;
    organizationCount?: number;
    enforceExecutionUniqueness?: boolean;
  } = {}
) {
  const handlerResult = { ok: true, output: { ok: true } };
  const handler = { run: vi.fn(async () => handlerResult) };
  mocks.getHandler.mockReturnValue(handler);
  const inserts: Record<string, unknown>[] = [];
  const executionKeys = new Set<string>();
  const from = vi.fn((table: string) => {
    let selection = "";
    let organizationScoped = false;
    const state: {
      data: unknown;
      error: { message: string; code?: string } | null;
    } = {
      data:
        table === "resolution_steps"
          ? { detail: { plannerProvider: "deterministic" } }
          : table === "tickets"
            ? options.ticket === false
              ? null
              : {
                  id: run.ticket_id,
                  organization_id: run.organization_id,
                  user_id: "user-1",
                }
            : null,
      error: null,
    };
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain.select = (value: unknown) => {
      selection = String(value);
      return chain;
    };
    for (const name of ["eq", "in", "order", "limit", "is", "gte", "update"]) {
      chain[name] = (...args: unknown[]) => {
        if (name === "eq" && args[0] === "organization_id")
          organizationScoped = true;
        return chain;
      };
    }
    chain.insert = (value: unknown) => {
      const row = (value ?? {}) as Record<string, unknown>;
      if (
        table === "capability_executions" &&
        options.enforceExecutionUniqueness &&
        typeof row.idempotency_key === "string" &&
        executionKeys.has(row.idempotency_key)
      ) {
        state.error = {
          message: "duplicate capability execution idempotency key",
          code: "23505",
        };
      } else {
        if (
          table === "capability_executions" &&
          typeof row.idempotency_key === "string"
        )
          executionKeys.add(row.idempotency_key);
        inserts.push(row);
      }
      return chain;
    };
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
        ? {
            data: state.error ? null : { id: "execution-1" },
            error: state.error,
          }
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
        count:
          table === "capability_executions"
            ? organizationScoped
              ? (options.organizationCount ?? 0)
              : (options.globalCount ?? 0)
            : null,
      }).then(resolve);
    };
    return chain;
  });
  const admin = { from, inserts };
  return {
    admin: admin as unknown as HandlerAdmin,
    handler,
    inserts,
  };
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
    minAssurance: "A0",
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    mocks.checkHourlyLimits.mockResolvedValue({ ok: true });
    mocks.isOrganizationPrivileged.mockResolvedValue(false);
    mocks.loadAccountRiskFacts.mockResolvedValue(null);
    mocks.loadStaffVerification.mockResolvedValue(null);
    mocks.getIdentityBinding.mockResolvedValue(null);
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

  test("denies A3 capabilities when assurance is disabled after identity binding", async () => {
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "false");
    const capability = {
      ...baseCapability(),
      minAssurance: "A3" as const,
      requiresIdentityBinding: false,
    };
    const { admin, handler } = makeAdmin();
    const result = await executeThroughGateway(
      admin,
      request({
        capability,
        assurance: {
          level: "A3",
          method: "test",
          authAt: null,
          expiresAt: null,
        },
      })
    );
    expect(result).toMatchObject({ ok: false, code: "assurance_disabled" });
    expect(handler.run).not.toHaveBeenCalled();
  });

  test("preserves identity-unbound priority over assurance denial", async () => {
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "true");
    const capability = {
      ...baseCapability(),
      minAssurance: "A3" as const,
      requiresIdentityBinding: true,
    };
    const { admin, handler } = makeAdmin();
    const result = await executeThroughGateway(
      admin,
      request({
        capability,
        assurance: {
          level: "A0",
          method: "test",
          authAt: null,
          expiresAt: null,
        },
      })
    );
    expect(result).toMatchObject({ ok: false, code: "identity_unbound" });
    expect(handler.run).not.toHaveBeenCalled();
  });

  test("denies high-risk account actions before inserting an execution", async () => {
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "true");
    vi.stubEnv("HELP_DESK_IDENTITY_RISK_SIGNALS_ENABLED", "true");
    mocks.getIdentityBinding.mockResolvedValue({
      organizationId: "org-1",
      ticketId: "ticket-1",
      userId: "user-1",
    });
    mocks.loadAccountRiskFacts.mockResolvedValue({
      priorAccountRequests24h: 2,
      mfaChangedAt: null,
      signIns: [],
      newestDeviceEnrolledAt: null,
      namesAnotherPerson: false,
      privileged: false,
    });
    const capability = {
      ...baseCapability(),
      id: "send_password_reset_link",
      minAssurance: "A3" as const,
      requiresIdentityBinding: true,
    };
    const { admin, handler, inserts } = makeAdmin();
    const result = await executeThroughGateway(admin, request({ capability }));
    expect(result).toMatchObject({ ok: false, code: "identity_risk_high" });
    expect(handler.run).not.toHaveBeenCalled();
    expect(inserts.some((row) => "idempotency_key" in row)).toBe(false);
  });

  test("requires staff verification for technician-approved account actions", async () => {
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "true");
    vi.stubEnv("HELP_DESK_STAFF_VERIFICATION_ENABLED", "true");
    mocks.getIdentityBinding.mockResolvedValue({
      organizationId: "org-1",
      ticketId: "ticket-1",
      userId: "user-1",
    });
    const capability = {
      ...baseCapability(),
      id: "send_password_reset_link",
      minAssurance: "A3" as const,
      requiresIdentityBinding: true,
    };
    const { admin, handler } = makeAdmin();
    const result = await executeThroughGateway(
      admin,
      request({
        capability,
        policy: {
          consent: { type: "technician_approval", userId: "staff-1" },
        },
      })
    );
    expect(result).toMatchObject({
      ok: false,
      code: "staff_verification_required",
    });
    expect(handler.run).not.toHaveBeenCalled();
  });

  test("denies the hourly blast-radius cap before inserting an execution", async () => {
    mocks.checkHourlyLimits.mockResolvedValue({
      ok: false,
      code: "blast_radius_limit",
      scope: "organization",
    });
    const { admin, handler, inserts } = makeAdmin();
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({ ok: false, code: "blast_radius_limit" });
    expect(handler.run).not.toHaveBeenCalled();
    expect(inserts.some((row) => "idempotency_key" in row)).toBe(false);
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

  test("reserves an idempotency key across five concurrent gateway calls", async () => {
    const { admin, handler, inserts } = makeAdmin({
      enforceExecutionUniqueness: true,
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => executeThroughGateway(admin, request()))
    );
    expect(handler.run).toHaveBeenCalledTimes(1);
    expect(
      inserts.filter((row) => row.idempotency_key === "key-1")
    ).toHaveLength(1);
    expect(
      inserts.filter(
        (row) =>
          row.kind === "guardrail.execution_allowed" &&
          (row.detail as { reasonCode?: string })?.reasonCode === "replay"
      )
    ).toHaveLength(4);
    expect(results.filter((result) => result.ok)).toHaveLength(5);
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

  test("denies an organization outside the pilot allow-list", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-2");
    const { admin } = makeAdmin();
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({
      ok: false,
      code: "pilot_org_not_allowlisted",
    });
    expect(
      (admin as unknown as { inserts: Record<string, unknown>[] }).inserts.at(
        -1
      )
    ).toEqual(
      expect.objectContaining({
        kind: "guardrail.policy_denied",
      })
    );
  });

  test("denies caution capabilities when no capability allow-list is configured", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    const { admin } = makeAdmin();
    const result = await executeThroughGateway(
      admin,
      request({
        capability: { ...request().capability, riskLevel: "caution" },
      })
    );
    expect(result).toMatchObject({
      ok: false,
      code: "pilot_capability_risk",
    });
  });

  test("rate-limits an organization at its daily limit without pausing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    vi.stubEnv("HELP_DESK_PILOT_ORG_DAILY_EXECUTION_LIMIT", "10");
    const { admin } = makeAdmin({ organizationCount: 10 });
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({
      ok: false,
      code: "pilot_org_daily_limit",
    });
    expect(mocks.setKillSwitch).not.toHaveBeenCalled();
  });

  test("rate-limits the global daily limit and pauses the organization", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    vi.stubEnv("HELP_DESK_AUTONOMY_DAILY_EXECUTION_LIMIT", "20");
    const { admin } = makeAdmin({ globalCount: 20 });
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({
      ok: false,
      code: "pilot_daily_limit",
    });
    expect(mocks.setKillSwitch).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ reason: "pilot_auto_pause:daily_limit" })
    );
  });

  test("keeps the kill switch denial ahead of pilot eligibility", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    mocks.readKillSwitches.mockResolvedValue({
      anyActive: true,
      reasons: ["organization"],
    });
    const { admin } = makeAdmin();
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({ ok: false, code: "kill_switch_active" });
  });

  test("pauses when an open breaker is observed", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    mocks.readBreakerState.mockResolvedValue({ open: true });
    const { admin } = makeAdmin();
    const result = await executeThroughGateway(admin, request());
    expect(result).toMatchObject({ ok: false, code: "breaker_open" });
    expect(mocks.setKillSwitch).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ reason: "pilot_auto_pause:breaker" })
    );
  });
});
