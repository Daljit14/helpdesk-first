import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executePlan: vi.fn(),
  readKillSwitches: vi.fn(),
}));

vi.mock("@/lib/autonomy/executor/execute", () => ({
  executePlan: mocks.executePlan,
}));
vi.mock("@/lib/autonomy/kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
}));

import { proposeAction } from "./actions";

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
  test("rejects top-level and nested target fields before execution", async () => {
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
});
