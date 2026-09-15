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
import { parameterHash } from "../guardrails/hash";

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

type AdminOptions = {
  approval?: Record<string, unknown> | null;
  ticketUserId?: string;
};

function admin(
  baseRun: Omit<typeof run, "status"> & {
    status: "planning" | "awaiting_consent";
  } = run,
  options: AdminOptions = {}
) {
  const inserts: Array<{ table: string; value: unknown }> = [];
  const updates: Array<{ table: string; value: unknown }> = [];
  const query = (table: string) => {
    let updated = false;
    const state = {
      data:
        table === "tickets"
          ? {
              platform: "Windows",
              category: null,
              organization_id: baseRun.organization_id,
              user_id: options.ticketUserId,
            }
          : table === "resolution_steps"
            ? { id: "step-1", detail: {} }
            : table === "resolution_runs"
              ? {
                  ...baseRun,
                  status: "executing",
                  attempts: 1,
                }
              : table === "notification_outbox"
                ? {
                    id: "00000000-0000-4000-8000-000000000002",
                    organization_id: baseRun.organization_id,
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
      "is",
    ]) {
      chain[name] = (value: unknown) => {
        if (name === "insert") inserts.push({ table, value });
        if (name === "update") {
          updated = true;
          updates.push({ table, value });
        }
        return chain;
      };
    }
    chain.maybeSingle = async () => {
      if (table === "approval_requests" && options.approval) {
        return {
          data: updated
            ? {
                ...options.approval,
                consumed_at: new Date().toISOString(),
              }
            : options.approval,
          error: null,
        };
      }
      return state;
    };
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
      Promise.resolve({
        data:
          table === "approval_requests" && options.approval
            ? [options.approval]
            : [],
        error: null,
      }).then(resolve)) as (...args: unknown[]) => unknown;
    return chain;
  };
  return {
    from: vi.fn((table: string) => query(table)),
    inserts,
    updates,
  };
}

const plan = {
  ticketId: "00000000-0000-4000-8000-000000000001",
  diagnosis: {
    summary: "A matching approved guide may help.",
    confidence: 0.9,
    evidenceIds: ["ticket"],
  },
  decision: "propose_action",
  capability: {
    id: "search_approved_knowledge",
    version: 1,
    parameters: {
      ticketId: "00000000-0000-4000-8000-000000000001",
      query: "display issue",
    },
  },
  verificationMethod: "none",
};

describe("executePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
    vi.stubEnv(
      "HELP_DESK_PILOT_CAPABILITY_ALLOWLIST",
      "search_approved_knowledge,resend_ticket_notification"
    );
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

  test("creates a fully bound approval for a fresh consent decision", async () => {
    mocks.decidePolicy.mockReturnValue({
      decision: "require_user_consent",
      reasons: ["capability_requires_user_consent"],
      policyVersion: "test",
      auditLabel: "Approval required",
      userLabel: "Approval required",
      consentSatisfied: false,
    });
    const consentPlan = {
      ...plan,
      capability: {
        id: "resend_ticket_notification",
        version: 1,
        parameters: {
          ticketId: run.ticket_id,
          notificationId: "00000000-0000-4000-8000-000000000002",
        },
      },
    };
    const client = admin();
    const result = await executePlan(client as never, run, consentPlan);
    const approval = client.inserts.find(
      (entry) => entry.table === "approval_requests"
    );
    expect(result?.status).toBe("awaiting_consent");
    expect(approval?.value).toEqual(
      expect.objectContaining({
        organization_id: run.organization_id,
        run_id: run.id,
        ticket_id: run.ticket_id,
        capability_id: "resend_ticket_notification",
        capability_version: 1,
        parameter_hash: parameterHash({
          capabilityId: "resend_ticket_notification",
          version: 1,
          parameters: consentPlan.capability.parameters,
        }),
        step_id: "step-1",
        risk_level: "caution",
        requested_by: "orchestrator",
        type: "user_consent",
        status: "requested",
      })
    );
    expect(approval?.value).toEqual(
      expect.objectContaining({
        nonce: expect.any(String),
        expires_at: expect.any(String),
      })
    );
    expect(
      new Date(
        (approval?.value as Record<string, unknown>).expires_at as string
      ).getTime()
    ).toBeGreaterThan(Date.now());
  });

  test("consumes bound granted consent and executes once", async () => {
    const consentPlan = {
      ...plan,
      capability: {
        id: "resend_ticket_notification",
        version: 1,
        parameters: {
          ticketId: run.ticket_id,
          notificationId: "00000000-0000-4000-8000-000000000002",
        },
      },
    };
    mocks.decidePolicy.mockReturnValue({
      decision: "require_user_consent",
      reasons: ["capability_requires_user_consent"],
      policyVersion: "test",
      auditLabel: "Approval required",
      userLabel: "Approval required",
      consentSatisfied: false,
    });
    const approval = {
      id: "approval-1",
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      type: "user_consent",
      status: "granted",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      capability_id: "resend_ticket_notification",
      capability_version: 1,
      parameter_hash: parameterHash({
        capabilityId: "resend_ticket_notification",
        version: 1,
        parameters: consentPlan.capability.parameters,
      }),
      risk_level: "caution",
      consumed_at: null,
      decided_by_user_id: "user-1",
    };
    const client = admin(run, { approval, ticketUserId: "user-1" });
    const handler = { run: vi.fn(async () => ({ ok: true, output: {} })) };
    mocks.getHandler.mockReturnValue(handler);
    const result = await executePlan(client as never, run, consentPlan, {
      actor: "user-1",
      consent: { type: "user_consent", userId: "user-1" },
    });
    expect(result?.status).toBe("verifying");
    expect(handler.run).toHaveBeenCalledTimes(1);
    expect(
      client.inserts.some(
        (entry) =>
          entry.table === "approval_requests" &&
          (entry.value as Record<string, unknown>).status === "requested"
      )
    ).toBe(false);
    expect(
      client.updates.some(
        (entry) =>
          entry.table === "approval_requests" &&
          "consumed_at" in (entry.value as Record<string, unknown>)
      )
    ).toBe(true);
  });

  test("escalates changed parameters before invoking the handler", async () => {
    const consentPlan = {
      ...plan,
      capability: {
        id: "resend_ticket_notification",
        version: 1,
        parameters: {
          ticketId: run.ticket_id,
          notificationId: "00000000-0000-4000-8000-000000000003",
        },
      },
    };
    mocks.decidePolicy.mockReturnValue({
      decision: "require_user_consent",
      reasons: ["capability_requires_user_consent"],
      policyVersion: "test",
      auditLabel: "Approval required",
      userLabel: "Approval required",
      consentSatisfied: false,
    });
    const approval = {
      id: "approval-1",
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      type: "user_consent",
      status: "granted",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      capability_id: "resend_ticket_notification",
      capability_version: 1,
      parameter_hash: parameterHash({
        capabilityId: "resend_ticket_notification",
        version: 1,
        parameters: {
          ticketId: run.ticket_id,
          notificationId: "00000000-0000-4000-8000-000000000002",
        },
      }),
      risk_level: "caution",
      consumed_at: null,
      decided_by_user_id: "user-1",
    };
    const client = admin(run, { approval, ticketUserId: "user-1" });
    const handler = { run: vi.fn(async () => ({ ok: true, output: {} })) };
    mocks.getHandler.mockReturnValue(handler);
    const result = await executePlan(client as never, run, consentPlan, {
      actor: "user-1",
      consent: { type: "user_consent", userId: "user-1" },
    });
    expect(result?.status).toBe("escalated");
    expect(handler.run).not.toHaveBeenCalled();
  });

  test("escalates consumed consent without invoking the handler", async () => {
    const consentPlan = {
      ...plan,
      capability: {
        id: "resend_ticket_notification",
        version: 1,
        parameters: {
          ticketId: run.ticket_id,
          notificationId: "00000000-0000-4000-8000-000000000002",
        },
      },
    };
    mocks.decidePolicy.mockReturnValue({
      decision: "require_user_consent",
      reasons: ["capability_requires_user_consent"],
      policyVersion: "test",
      auditLabel: "Approval required",
      userLabel: "Approval required",
      consentSatisfied: false,
    });
    const approval = {
      id: "approval-1",
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      type: "user_consent",
      status: "granted",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      capability_id: "resend_ticket_notification",
      capability_version: 1,
      parameter_hash: parameterHash({
        capabilityId: "resend_ticket_notification",
        version: 1,
        parameters: consentPlan.capability.parameters,
      }),
      risk_level: "caution",
      consumed_at: new Date().toISOString(),
      decided_by_user_id: "user-1",
    };
    const client = admin(run, { approval, ticketUserId: "user-1" });
    const handler = { run: vi.fn(async () => ({ ok: true, output: {} })) };
    mocks.getHandler.mockReturnValue(handler);
    const result = await executePlan(client as never, run, consentPlan, {
      actor: "user-1",
      consent: { type: "user_consent", userId: "user-1" },
    });
    expect(result?.status).toBe("escalated");
    expect(handler.run).not.toHaveBeenCalled();
  });

  test("rejects shell-string parameters before invoking a handler", async () => {
    const result = await executePlan(admin() as never, run, {
      ...plan,
      capability: {
        ...plan.capability,
        parameters: { ticketId: run.ticket_id, query: "run powershell" },
      },
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
