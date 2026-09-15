import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executePlan: vi.fn(),
  escalateRun: vi.fn(),
  transitionRun: vi.fn(),
  verifyConsent: vi.fn(),
}));

vi.mock("./execute", () => ({ executePlan: mocks.executePlan }));
vi.mock("../orchestrator", () => ({
  escalateRun: mocks.escalateRun,
  transitionRun: mocks.transitionRun,
}));
vi.mock("../guardrails/consent", () => ({
  verifyConsent: mocks.verifyConsent,
}));

import { resumeAfterApproval } from "./resume";
import { assertTransition } from "../state-machine";

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

describe("resumeAfterApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyConsent.mockResolvedValue({ ok: true, id: "approval-1" });
    mocks.transitionRun.mockImplementation(async (_admin, value, to) => {
      assertTransition(value.status, to);
      return { ...value, status: to };
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
