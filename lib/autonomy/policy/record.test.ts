import { describe, expect, test, vi } from "vitest";
import { recordPolicyDecision } from "./record";
import type { PolicyDecision, PolicyInput } from "./types";

const input: PolicyInput = {
  capability: {
    id: "capability",
    version: 1,
    riskLevel: "safe",
    sideEffects: "read_only",
    consent: "none",
    orgPolicyRequirements: [],
    platforms: ["any"],
  },
  organization: {
    capabilityEnabled: true,
    grantedPolicies: [],
    requireApprovalFor: [],
  },
  actorRole: "system",
  deviceOwnership: "unknown",
  platform: null,
  ticketCategory: null,
  confidence: 0.9,
  evidenceQuality: "sufficient",
  consent: { user: false, technician: false },
  priorFailedAttempts: 0,
  parametersValid: true,
  sensitivity: {
    credentialsDetected: false,
    piiDetected: false,
    studentData: false,
    securityIncident: false,
  },
  killSwitchActive: false,
  breakerOpen: false,
};

const decision: PolicyDecision = {
  decision: "allow_automatic",
  reasons: ["capability_risk_safe"],
  policyVersion: "2026-09-14.1",
  auditLabel: "Safe",
  userLabel: "Safe",
};

function admin(result: { data: unknown; error: { message: string } | null }) {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
  };
  return { from: vi.fn(() => query), query };
}

describe("recordPolicyDecision", () => {
  test("inserts the complete scoped policy snapshot", async () => {
    const client = admin({ data: { id: "decision-1" }, error: null });
    const result = await recordPolicyDecision(client as never, {
      organizationId: "org-1",
      runId: "run-1",
      stepId: "step-1",
      input,
      decision,
    });
    expect(result).toEqual({ ok: true, id: "decision-1" });
    expect(client.query.insert).toHaveBeenCalledWith({
      organization_id: "org-1",
      run_id: "run-1",
      step_id: "step-1",
      capability_id: "capability",
      capability_version: 1,
      decision: "allow_automatic",
      reasons: ["capability_risk_safe"],
      input,
      policy_version: "2026-09-14.1",
      initiated_by: "ai",
      versions: expect.objectContaining({
        capability: "capability@1",
      }),
    });
    expect(client.query.select).toHaveBeenCalledWith("id");
  });

  test("returns a failure instead of throwing", async () => {
    const client = admin({
      data: null,
      error: { message: "insert failed" },
    });
    await expect(
      recordPolicyDecision(client as never, {
        organizationId: "org-1",
        runId: "run-1",
        stepId: "step-1",
        input,
        decision,
      })
    ).resolves.toEqual({ ok: false, error: "insert failed" });
  });

  test("converts thrown errors to a failure result", async () => {
    const from = vi.fn(() => {
      throw new Error("offline");
    });
    await expect(
      recordPolicyDecision({ from } as never, {
        organizationId: "org-1",
        runId: "run-1",
        stepId: "step-1",
        input,
        decision,
      })
    ).resolves.toEqual({ ok: false, error: "offline" });
  });
});
