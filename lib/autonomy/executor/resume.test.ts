import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executePlan: vi.fn(),
  escalateRun: vi.fn(),
  transitionRun: vi.fn(),
  resolutionStepPosition: vi.fn(() => 1),
  verifyConsent: vi.fn(),
  getHandler: vi.fn(),
  decidePolicy: vi.fn(),
}));

vi.mock("./execute", () => ({ executePlan: mocks.executePlan }));
vi.mock("../orchestrator", () => ({
  escalateRun: mocks.escalateRun,
  transitionRun: mocks.transitionRun,
  resolutionStepPosition: mocks.resolutionStepPosition,
}));
vi.mock("../guardrails/consent", async () => {
  return await vi.importActual("../guardrails/consent");
});
vi.mock("./handlers", () => ({
  getHandler: mocks.getHandler,
}));
vi.mock("../policy/engine", () => ({
  decidePolicy: mocks.decidePolicy,
}));

import { resumeAfterApproval } from "./resume";
import { assertTransition } from "../state-machine";
import { parameterHash } from "../guardrails/hash";

const run = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: "ticket-1",
  status: "awaiting_approval" as const,
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

function admin(status: string, expiresAt: string | null = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: "step-1",
          detail: {
            plan: {
              ticketId: "ticket-1",
              diagnosis: {
                summary: "Approved action",
                confidence: 1,
                evidenceIds: ["ticket"],
              },
              decision: "propose_action",
              capability: {
                id: "search_approved_knowledge",
                version: 1,
                parameters: { ticketId: "ticket-1", query: "display" },
              },
              verificationMethod: "none",
            },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status,
          expires_at: expiresAt,
          capability_id: "search_approved_knowledge",
          capability_version: 1,
          parameter_hash: "hash",
          risk_level: "low",
          decided_by_user_id: "ai",
        },
        error: null,
      }),
  };
  return { from: vi.fn(() => query) };
}

function integrationAdmin(
  integrationRun: Omit<typeof run, "status"> & {
    status: "awaiting_approval" | "awaiting_consent";
  },
  approval: Record<string, unknown>
) {
  const inserts: Array<{ table: string; value: unknown }> = [];
  const updates: Array<{ table: string; value: unknown }> = [];
  const plan = {
    ticketId: integrationRun.ticket_id,
    diagnosis: {
      summary: "Approved action",
      confidence: 1,
      evidenceIds: ["ticket"],
    },
    decision: "propose_action",
    capability: {
      id: "resend_ticket_notification",
      version: 1,
      parameters: {
        ticketId: integrationRun.ticket_id,
        notificationId: "00000000-0000-4000-8000-000000000002",
      },
    },
    verificationMethod: "none",
  };
  const query = (table: string) => {
    let updated = false;
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    const data =
      table === "resolution_steps"
        ? { id: "step-1", detail: { plan } }
        : table === "approval_requests"
          ? approval
          : table === "tickets"
            ? {
                id: integrationRun.ticket_id,
                organization_id: integrationRun.organization_id,
                platform: "Windows",
                user_id: "user-1",
              }
            : table === "notification_outbox"
              ? {
                  id: "00000000-0000-4000-8000-000000000002",
                  organization_id: integrationRun.organization_id,
                  ticket_id: integrationRun.ticket_id,
                }
              : table === "organization_capabilities"
                ? { min_version: 1, enabled: true }
                : table === "organization_autonomy_policies"
                  ? {
                      granted_policies: ["autonomy.notifications"],
                      require_approval_for: [],
                    }
                  : table === "capability_versions"
                    ? { status: "active" }
                    : null;
    for (const name of [
      "select",
      "eq",
      "in",
      "or",
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
    chain.maybeSingle = async () => ({
      data:
        table === "approval_requests" && updated
          ? { ...approval, consumed_at: new Date().toISOString() }
          : data,
      error: null,
    });
    chain.single = async () => ({
      data:
        table === "resolution_runs"
          ? { ...integrationRun, status: "executing", attempts: 1 }
          : table === "resolution_steps"
            ? { id: "step-2", detail: {} }
            : table === "capability_executions"
              ? { id: "execution-1" }
              : data,
      error: null,
    });
    chain.then = ((resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: table === "approval_requests" ? [approval] : [],
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

describe("resumeAfterApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyConsent.mockResolvedValue({ ok: true, id: "approval-1" });
    mocks.transitionRun.mockImplementation(async (_admin, value, to) => {
      assertTransition(value.status, to);
      return { ...value, status: to };
    });
    mocks.decidePolicy.mockReturnValue({
      decision: "require_user_consent",
      reasons: ["capability_requires_user_consent"],
      policyVersion: "test",
      auditLabel: "Approval required",
      userLabel: "Approval required",
      consentSatisfied: false,
    });
  });

  test("granted approvals rerun the plan", async () => {
    mocks.executePlan.mockResolvedValue({ ...run, status: "verifying" });
    const result = await resumeAfterApproval(admin("granted") as never, run);
    expect(mocks.executePlan).toHaveBeenCalledWith(
      expect.anything(),
      run,
      expect.anything(),
      expect.objectContaining({ stepId: "step-1" })
    );
    expect(result?.status).toBe("verifying");
    expect(mocks.transitionRun).not.toHaveBeenCalled();
  });

  test("granted consent executes through the real executor and consumes approval", async () => {
    const { executePlan: realExecutePlan } =
      await vi.importActual<typeof import("./execute")>("./execute");
    mocks.executePlan.mockImplementation(realExecutePlan);
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_CAPABILITY_REGISTRY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_CAP_RESEND_TICKET_NOTIFICATION_ENABLED", "true");
    const handler = {
      run: vi.fn(async () => ({ ok: true, output: { queued: true } })),
    };
    mocks.getHandler.mockReturnValue(handler);
    const integrationRun = {
      ...run,
      ticket_id: "00000000-0000-4000-8000-000000000001",
      status: "awaiting_consent" as const,
    };
    const parameters = {
      ticketId: integrationRun.ticket_id,
      notificationId: "00000000-0000-4000-8000-000000000002",
    };
    const approval = {
      id: "approval-1",
      organization_id: integrationRun.organization_id,
      run_id: integrationRun.id,
      ticket_id: integrationRun.ticket_id,
      step_id: "step-1",
      type: "user_consent",
      status: "granted",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      capability_id: "resend_ticket_notification",
      capability_version: 1,
      parameter_hash: parameterHash({
        capabilityId: "resend_ticket_notification",
        version: 1,
        parameters,
      }),
      risk_level: "caution",
      consumed_at: null,
      decided_by_user_id: "user-1",
    };
    const client = integrationAdmin(integrationRun, approval);
    const result = await resumeAfterApproval(client as never, integrationRun, {
      actor: "user-1",
    });

    expect(result?.status).toBe("verifying");
    expect(handler.run).toHaveBeenCalledTimes(1);
    expect(
      client.updates.some(
        (entry) =>
          entry.table === "approval_requests" &&
          "consumed_at" in (entry.value as Record<string, unknown>)
      )
    ).toBe(true);
  });

  test("denied approvals escalate", async () => {
    mocks.escalateRun.mockResolvedValue({ ...run, status: "escalated" });
    const result = await resumeAfterApproval(admin("denied") as never, run);
    expect(mocks.escalateRun).toHaveBeenCalledWith(
      expect.anything(),
      run,
      "approval_denied"
    );
    expect(result?.status).toBe("escalated");
  });

  test("expired approvals escalate", async () => {
    mocks.escalateRun.mockResolvedValue({ ...run, status: "escalated" });
    const result = await resumeAfterApproval(
      admin("requested", new Date(Date.now() - 1).toISOString()) as never,
      run
    );
    expect(mocks.escalateRun).toHaveBeenCalledWith(
      expect.anything(),
      run,
      "approval_expired"
    );
    expect(result?.status).toBe("escalated");
  });

  test("pending unexpired approvals leave the run untouched", async () => {
    const result = await resumeAfterApproval(
      admin("requested", new Date(Date.now() + 60_000).toISOString()) as never,
      run
    );
    expect(result).toBe(run);
    expect(mocks.escalateRun).not.toHaveBeenCalled();
    expect(mocks.transitionRun).not.toHaveBeenCalled();
    expect(mocks.executePlan).not.toHaveBeenCalled();
  });

  test("approval transition mocks enforce the state machine", () => {
    expect(() => assertTransition("awaiting_consent", "planning")).toThrow(
      "Illegal autonomy transition"
    );
  });
});
