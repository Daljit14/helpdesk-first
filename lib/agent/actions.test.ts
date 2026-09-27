import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executePlan: vi.fn(),
  readKillSwitches: vi.fn(),
  consumeAiConsent: vi.fn(),
  resumeAfterApproval: vi.fn(),
  startRun: vi.fn(),
  transitionRun: vi.fn(),
  writeStep: vi.fn(),
  updateSession: vi.fn(),
  escalate: vi.fn(),
}));

vi.mock("@/lib/autonomy/executor/execute", () => ({
  executePlan: mocks.executePlan,
}));
vi.mock("@/lib/autonomy/kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
}));
vi.mock("@/app/actions/resolution", () => ({
  consumeAiConsent: mocks.consumeAiConsent,
}));
vi.mock("@/lib/autonomy/executor/resume", () => ({
  resumeAfterApproval: mocks.resumeAfterApproval,
}));
vi.mock("@/lib/autonomy/orchestrator", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/autonomy/orchestrator")
  >("@/lib/autonomy/orchestrator");
  return {
    ...actual,
    startRun: mocks.startRun,
    transitionRun: mocks.transitionRun,
  };
});
vi.mock("./session", () => ({
  writeStep: mocks.writeStep,
  updateSession: mocks.updateSession,
  escalate: mocks.escalate,
}));

import { decideConsent, ensureBackingRun, proposeAction } from "./actions";
import type { ResolutionRun } from "@/lib/autonomy/orchestrator";
import { canTransition } from "@/lib/autonomy/state-machine";
import type { AgentSession } from "./types";

const session = {
  id: "session-1",
  organization_id: "org-1",
  requester_id: "user-1",
  status: "active" as const,
  started_at: new Date().toISOString(),
  ended_at: null,
  last_user_message: "Fix my device",
  resolution_summary: null,
  escalation_ticket_id: null,
  action_count: 0,
  tool_call_count: 0,
  model_turn_count: 0,
  token_count: 0,
  halt_reason: null,
  security_flag: false,
  updated_at: new Date().toISOString(),
};

describe("requester action proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readKillSwitches.mockResolvedValue({
      anyActive: false,
      global: false,
      organization: false,
      capability: false,
      provider: false,
      envDisabled: false,
      explicit: false,
      reasons: [],
    });
    mocks.writeStep.mockResolvedValue(undefined);
    mocks.updateSession.mockImplementation(
      async (
        _admin: unknown,
        target: typeof session,
        values: Record<string, unknown>
      ) => Object.assign(target, values)
    );
  });

  test("rejects top-level and nested target fields before execution", async () => {
    const admin = {} as never;
    const context = {
      actor: "requester_agent:session-1",
      evidence: [],
    };
    const topLevel = await proposeAction(
      admin,
      session,
      {
        capabilityId: "device_flush_dns",
        params: { email: "other@example.com" },
        hypothesisId: "ev-1",
        rationale: "diagnostics",
      },
      context
    );
    const nested = await proposeAction(
      admin,
      session,
      {
        capabilityId: "device_flush_dns",
        params: { target: { device_id: "other-device" } },
        hypothesisId: "ev-1",
        rationale: "diagnostics",
      },
      context
    );
    expect(topLevel).toMatchObject({ kind: "rejected", code: "target_field" });
    expect(nested).toMatchObject({ kind: "rejected", code: "target_field" });
    expect(mocks.executePlan).not.toHaveBeenCalled();
  });

  test("walks queued runs through legal FSM transitions", async () => {
    const run: ResolutionRun = {
      id: "run-1",
      organization_id: session.organization_id,
      ticket_id: "ticket-1",
      status: "queued",
      previous_status: null,
      attempts: 0,
      max_attempts: 3,
      cost_cents: 0,
      budget_cents: 100,
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      initiated_by: "requester_agent:session-1",
      planner_version: null,
      model: null,
      prompt_version: null,
      policy_version: null,
      escalation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    const target: AgentSession = {
      ...session,
      backing_ticket_id: run.ticket_id,
    };
    const transitions: Array<
      [ResolutionRun["status"], ResolutionRun["status"]]
    > = [];
    mocks.startRun.mockResolvedValue({ run, created: false });
    mocks.transitionRun.mockImplementation(
      async (
        _admin: unknown,
        current: ResolutionRun,
        to: ResolutionRun["status"]
      ) => {
        transitions.push([current.status, to]);
        expect(canTransition(current.status, to)).toBe(true);
        return { ...current, previous_status: current.status, status: to };
      }
    );

    const result = await ensureBackingRun({} as never, target, "Windows");

    expect(result?.status).toBe("planning");
    expect(transitions).toEqual([
      ["queued", "investigating"],
      ["investigating", "planning"],
    ]);
  });

  test("escalates the session when execution is denied after consent", async () => {
    const target: AgentSession = {
      ...session,
      resolution_run_id: "run-1",
      pending_approval_id: "approval-1",
    };
    const approval = {
      id: "approval-1",
      run_id: "run-1",
      step_id: "step-1",
      capability_id: "device_flush_dns",
      parameter_hash: "hash-1",
      status: "requested",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const query = (data: unknown) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data, error: null }),
      };
      return chain;
    };
    const admin = {
      from: (table: string) =>
        query(
          table === "approval_requests"
            ? approval
            : { id: "run-1", status: "awaiting_consent" }
        ),
    } as never;
    mocks.consumeAiConsent.mockResolvedValue({ ok: true, request: approval });
    mocks.resumeAfterApproval.mockResolvedValue({
      ...target,
      status: "escalated",
      escalation_reason: "kill_switch",
    });
    mocks.escalate.mockImplementation(
      async (_admin: unknown, current: typeof target, reason: string) => {
        current.status = "escalated";
        await mocks.writeStep(_admin, current, {
          kind: "escalated",
          resultSummary: reason,
        });
        return "ticket-1";
      }
    );
    const events: unknown[] = [];

    const result = await decideConsent(
      admin,
      target,
      {
        approvalRequestId: "approval-1",
        decision: "approve",
        userId: "user-1",
      },
      (event) => events.push(event),
      new AbortController().signal
    );

    expect(result).toBe("escalated");
    expect(target.status).toBe("escalated");
    expect(mocks.escalate).toHaveBeenCalledWith(
      admin,
      target,
      "kill_switch",
      expect.any(String)
    );
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      target,
      expect.objectContaining({ kind: "escalated" })
    );
    expect(events).toContainEqual({
      type: "escalated",
      ticketId: "ticket-1",
      reason: "kill_switch",
    });
  });

  test("records an audit step when consent is expired or invalid", async () => {
    const target: AgentSession = {
      ...session,
      resolution_run_id: "run-1",
      pending_approval_id: "approval-1",
    };
    const query = (data: unknown) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data, error: null }),
      };
      return chain;
    };
    const admin = {
      from: () => query(null),
    } as never;

    const result = await decideConsent(
      admin,
      target,
      {
        approvalRequestId: "approval-1",
        decision: "approve",
        userId: "user-1",
      },
      vi.fn(),
      new AbortController().signal
    );

    expect(result).toBe("invalid");
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      target,
      expect.objectContaining({
        kind: "action_rejected",
        resultSummary: "Consent request expired or invalid.",
      })
    );
  });
});
