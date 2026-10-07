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
  readTier: vi.fn(),
  isSnapshotReversible: vi.fn(),
  autorunEnabled: vi.fn(),
}));

vi.mock("@/lib/autonomy/executor/execute", () => ({
  executePlan: mocks.executePlan,
}));
vi.mock("@/lib/autonomy/kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
}));
vi.mock("@/lib/autonomy/ladder", async () => {
  const actual = await vi.importActual<typeof import("@/lib/autonomy/ladder")>(
    "@/lib/autonomy/ladder"
  );
  return {
    ...actual,
    readTier: mocks.readTier,
    isSnapshotReversible: mocks.isSnapshotReversible,
  };
});
vi.mock("@/lib/admin/flags", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/flags")>(
      "@/lib/admin/flags"
    );
  return {
    ...actual,
    isRequesterAgentAutorunEnabledForOrg: mocks.autorunEnabled,
  };
});
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

const session: AgentSession = {
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

const run: ResolutionRun = {
  id: "run-1",
  organization_id: session.organization_id,
  ticket_id: "ticket-1",
  status: "planning",
  previous_status: null,
  attempts: 1,
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

function actionAdmin(options: { approval?: Record<string, unknown> } = {}) {
  const inserts: Array<{ table: string; value: unknown }> = [];
  const query = (table: string) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = () => chain;
    chain.gte = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.update = () => chain;
    chain.insert = (value: unknown) => {
      inserts.push({ table, value });
      return chain;
    };
    chain.single = async () => ({ data: { id: "plan-step-1" }, error: null });
    chain.maybeSingle = async () => ({
      data:
        table === "approval_requests"
          ? (options.approval ?? null)
          : table === "agent_steps"
            ? { policy_decision: "clean" }
            : table === "tickets"
              ? { platform: "Windows", user_id: "user-1" }
              : table === "devices_public"
                ? { hostname: "laptop-1" }
                : null,
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
    inserts,
  };
}

function proposalSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    ...session,
    backing_ticket_id: "ticket-1",
    autorun_consent_granted_at: new Date().toISOString(),
    autorun_consent_revoked_at: null,
    autorun_consent_expires_at: new Date(Date.now() + 60_000).toISOString(),
    autorun_consent_capabilities: ["device_flush_dns"],
    ...overrides,
  };
}

describe("requester action proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "false");
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
    mocks.readTier.mockResolvedValue("consent");
    mocks.isSnapshotReversible.mockReturnValue(true);
    mocks.autorunEnabled.mockReturnValue(true);
    mocks.startRun.mockResolvedValue({ run, created: false });
    mocks.transitionRun.mockImplementation(
      async (
        _admin: unknown,
        current: ResolutionRun,
        status: ResolutionRun["status"]
      ) => ({ ...current, status, previous_status: current.status })
    );
  });

  test("rejects account changes while identity assurance is disabled", async () => {
    const admin = actionAdmin();
    const result = await proposeAction(
      admin as never,
      proposalSession(),
      {
        capabilityId: "send_password_reset_link",
        params: {},
        hypothesisId: "ev-1",
        rationale: "Reset the account password.",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_ticket_history" }],
        provenance: { userTexts: [], items: [] },
        assurance: {
          level: "A3",
          method: "supabase_mfa",
          authAt: null,
          expiresAt: null,
        },
      }
    );

    expect(result).toEqual({
      kind: "rejected",
      code: "assurance_disabled",
      message:
        "Account changes aren't available in chat yet; a technician can help.",
    });
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      expect.anything(),
      expect.objectContaining({
        kind: "action_rejected",
        resultSummary: expect.stringContaining("assurance_disabled"),
      })
    );
    expect(mocks.startRun).not.toHaveBeenCalled();
    expect(mocks.executePlan).not.toHaveBeenCalled();
  });

  test("requests step-up for insufficient account assurance without escalating", async () => {
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "true");
    const admin = actionAdmin();
    const events: unknown[] = [];
    const result = await proposeAction(
      admin as never,
      proposalSession(),
      {
        capabilityId: "send_password_reset_link",
        params: {},
        hypothesisId: "ev-1",
        rationale: "Reset the account password.",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_ticket_history" }],
        provenance: { userTexts: [], items: [] },
        assurance: {
          level: "A1",
          method: "session",
          authAt: null,
          expiresAt: null,
        },
        emit: (event) => events.push(event),
      }
    );

    expect(result).toMatchObject({
      kind: "rejected",
      code: "assurance_required",
    });
    expect(events).toEqual([
      {
        type: "step_up_required",
        card: {
          capabilityId: "send_password_reset_link",
          requiredLevel: "A3",
          currentLevel: "A1",
          stepUpUrl: "/auth/step-up?next=/assistant",
        },
      },
    ]);
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      expect.anything(),
      expect.objectContaining({ kind: "step_up_required" })
    );
    expect(mocks.escalate).not.toHaveBeenCalled();
    expect(mocks.startRun).not.toHaveBeenCalled();
  });

  test("does not let organization environment evidence authorize an action", async () => {
    const admin = actionAdmin();
    const result = await proposeAction(
      admin as never,
      proposalSession(),
      {
        capabilityId: "device_flush_dns",
        params: {},
        hypothesisId: "ev-1",
        rationale: "The profile mentions this VPN.",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_org_environment" }],
        provenance: { userTexts: [], items: [] },
      }
    );
    expect(result).toMatchObject({
      kind: "rejected",
      code: "research_only_evidence",
    });
    expect(mocks.executePlan).not.toHaveBeenCalled();
  });

  test("does not let similar-issue research authorize an action", async () => {
    const admin = actionAdmin();
    const result = await proposeAction(
      admin as never,
      proposalSession(),
      {
        capabilityId: "device_flush_dns",
        params: {},
        hypothesisId: "ev-1",
        rationale: "Other people reported this issue.",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "count_similar_org_issues" }],
        provenance: { userTexts: [], items: [] },
      }
    );
    expect(result).toMatchObject({
      kind: "rejected",
      code: "research_only_evidence",
    });
    expect(mocks.executePlan).not.toHaveBeenCalled();
  });

  test("does not let web-search evidence authorize an action", async () => {
    const admin = actionAdmin();
    const result = await proposeAction(
      admin as never,
      proposalSession(),
      {
        capabilityId: "device_flush_dns",
        params: {},
        hypothesisId: "ev-1",
        rationale: "A web source suggested this action.",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "search_web" }],
        provenance: { userTexts: [], items: [] },
      }
    );
    expect(result).toMatchObject({
      kind: "rejected",
      code: "research_only_evidence",
    });
    expect(mocks.executePlan).not.toHaveBeenCalled();
  });

  test("passes covered session consent to autorun and writes an autorun step", async () => {
    mocks.readTier.mockResolvedValue("autorun");
    mocks.executePlan.mockResolvedValue({ status: "executing" });
    const target = proposalSession();
    const admin = actionAdmin();
    const signal = new AbortController();
    signal.abort();

    await proposeAction(
      admin as never,
      target,
      {
        capabilityId: "device_flush_dns",
        params: {},
        hypothesisId: "ev-1",
        rationale: "diagnostics",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_device_status" }],
        provenance: { userTexts: [], items: [] },
        signal: signal.signal,
      }
    );

    const deps = mocks.executePlan.mock.calls[0][3];
    expect(deps).toEqual(
      expect.objectContaining({
        sessionConsent: {
          userId: "user-1",
          grantedAt: target.autorun_consent_granted_at,
          capabilityIds: ["device_flush_dns"],
        },
      })
    );
    expect(deps.forceUserConsent).toBeUndefined();
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      target,
      expect.objectContaining({ kind: "action_autorun" })
    );
  });

  test.each<
    [
      string,
      {
        tier: "consent" | "autorun";
        flag?: boolean;
        reversible?: boolean;
        consent?: null;
        overrides?: Partial<AgentSession>;
      },
    ]
  >([
    ["autorun flag off", { tier: "autorun", flag: false }],
    ["missing consent", { tier: "autorun", consent: null }],
    [
      "expired consent",
      {
        tier: "autorun",
        overrides: {
          autorun_consent_expires_at: new Date(
            Date.now() - 1_000
          ).toISOString(),
        },
      },
    ],
    [
      "revoked consent",
      {
        tier: "autorun",
        overrides: { autorun_consent_revoked_at: new Date().toISOString() },
      },
    ],
    ["consent tier", { tier: "consent" }],
    ["non-reversible capability", { tier: "autorun", reversible: false }],
  ])("forces user consent for %s", async (_name, options) => {
    mocks.readTier.mockResolvedValue(options.tier);
    mocks.autorunEnabled.mockReturnValue(options.flag ?? true);
    mocks.isSnapshotReversible.mockReturnValue(options.reversible ?? true);
    mocks.executePlan.mockResolvedValue({ status: "escalated" });
    const target = proposalSession(options.overrides);
    if ("consent" in options && options.consent === null) {
      target.autorun_consent_granted_at = null;
      target.autorun_consent_expires_at = null;
    }

    await proposeAction(
      actionAdmin() as never,
      target,
      {
        capabilityId: "device_flush_dns",
        params: {},
        hypothesisId: "ev-1",
        rationale: "diagnostics",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_device_status" }],
        provenance: { userTexts: [], items: [] },
      }
    );

    expect(mocks.executePlan.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        forceUserConsent: true,
        consentTtlMs: 300_000,
      })
    );
    expect(mocks.executePlan.mock.calls[0][3].sessionConsent).toBeUndefined();
  });

  test.each([
    ["shadow", "tier_shadow", "action_shadowed"],
    ["disabled", "tier_disabled", "action_rejected"],
  ] as const)(
    "rejects %s before creating backing work",
    async (tier, code, stepKind) => {
      mocks.readTier.mockResolvedValue(tier);
      const admin = actionAdmin();
      const result = await proposeAction(
        admin as never,
        proposalSession(),
        {
          capabilityId: "device_flush_dns",
          params: {},
          hypothesisId: "ev-1",
          rationale: "diagnostics",
        },
        {
          actor: "requester_agent:session-1",
          evidence: [{ id: "ev-1", tool: "get_device_status" }],
          provenance: { userTexts: [], items: [] },
        }
      );

      expect(result).toMatchObject({ kind: "rejected", code });
      expect(mocks.writeStep).toHaveBeenCalledWith(
        admin,
        expect.anything(),
        expect.objectContaining({ kind: stepKind })
      );
      expect(admin.inserts).not.toContainEqual(
        expect.objectContaining({ table: "resolution_steps" })
      );
      expect(mocks.startRun).not.toHaveBeenCalled();
      expect(mocks.executePlan).not.toHaveBeenCalled();
    }
  );

  test("falls back to a consent card when autorun execution awaits consent", async () => {
    mocks.readTier.mockResolvedValue("autorun");
    mocks.executePlan.mockResolvedValue({ status: "awaiting_consent" });
    const approval = {
      id: "approval-1",
      run_id: "run-1",
      step_id: "plan-step-1",
      capability_id: "device_flush_dns",
      parameter_hash: "hash-1",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const admin = actionAdmin({ approval });
    const target = proposalSession();
    const result = await proposeAction(
      admin as never,
      target,
      {
        capabilityId: "device_flush_dns",
        params: {},
        hypothesisId: "ev-1",
        rationale: "diagnostics",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_device_status" }],
        provenance: { userTexts: [], items: [] },
      }
    );

    expect(result.kind).toBe("consent_required");
    expect(mocks.writeStep).not.toHaveBeenCalledWith(
      admin,
      target,
      expect.objectContaining({ kind: "action_autorun" })
    );
  });

  test("rejects a proposal whose parameter came from external diagnostics", async () => {
    const admin = actionAdmin();
    const result = await proposeAction(
      admin as never,
      proposalSession(),
      {
        capabilityId: "device_flush_dns",
        params: { hostname: "PC-7ABCDE" },
        hypothesisId: "ev-1",
        rationale: "The device has a DNS failure.",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_device_diagnostics" }],
        provenance: {
          userTexts: [],
          items: [
            {
              evidenceId: "ev-1",
              source: "get_device_diagnostics",
              trust: "external_untrusted",
              text: "DNS failure reported for PC-7ABCDE.",
            },
          ],
        },
      }
    );

    expect(result).toEqual({
      kind: "rejected",
      code: "tainted_parameter",
      message:
        "That value came from content you didn't type, so I can't use it in a fix.",
    });
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      expect.anything(),
      expect.objectContaining({
        kind: "action_rejected",
        resultSummary: expect.stringContaining("tainted_parameter"),
      })
    );
    expect(mocks.startRun).not.toHaveBeenCalled();
    expect(mocks.executePlan).not.toHaveBeenCalled();
  });

  test("requires reconfirmation for tainted autorun and discloses the value", async () => {
    mocks.readTier.mockResolvedValue("autorun");
    mocks.executePlan.mockResolvedValue({ status: "awaiting_consent" });
    mocks.writeStep.mockResolvedValue("step-1");
    const approval = {
      id: "approval-tainted",
      run_id: "run-1",
      step_id: "plan-step-1",
      capability_id: "device_flush_dns",
      parameter_hash: "hash-1",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const admin = actionAdmin({ approval });
    const result = await proposeAction(
      admin as never,
      proposalSession(),
      {
        capabilityId: "device_flush_dns",
        params: { hostname: "Contoso-Secure-5G" },
        hypothesisId: "ev-1",
        rationale: "The device has a DNS failure.",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_service_health" }],
        provenance: {
          userTexts: [],
          items: [
            {
              evidenceId: "ev-1",
              source: "get_service_health",
              trust: "vendor",
              text: "DNS outage for Contoso-Secure-5G.",
            },
          ],
        },
      }
    );

    expect(result).toMatchObject({
      kind: "consent_required",
      approvalRequestId: "approval-tainted",
      card: {
        requiresReconfirm: true,
        tainted: [
          {
            param: "hostname",
            value: "Contoso-Secure-5G",
            source: "a service status page",
            trust: "vendor",
          },
        ],
      },
    });
    expect(mocks.executePlan.mock.calls[0][3]).toMatchObject({
      forceUserConsent: true,
    });
    expect(mocks.executePlan.mock.calls[0][3].sessionConsent).toBeUndefined();
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      expect.anything(),
      expect.objectContaining({
        kind: "consent_required",
        consentId: "approval-tainted",
        policyDecision: "reconfirm",
      })
    );
  });

  test.each([
    ["HTML", "<img src=x onerror=alert(1)>"],
    ["URL", "https://evil.example/login"],
    ["overlong", "x".repeat(121)],
    ["G4 secret", "sk-live_abcdef1234567890"],
  ])(
    "rejects tainted %s values that cannot be shown unchanged",
    async (_label, value) => {
      const admin = actionAdmin();
      const result = await proposeAction(
        admin as never,
        proposalSession(),
        {
          capabilityId: "device_flush_dns",
          params: { hostname: value },
          hypothesisId: "ev-1",
          rationale: "The device has a DNS failure.",
        },
        {
          actor: "requester_agent:session-1",
          evidence: [{ id: "ev-1", tool: "get_service_health" }],
          provenance: {
            userTexts: [],
            items: [
              {
                evidenceId: "ev-1",
                source: "get_service_health",
                trust: "vendor",
                text: `DNS outage for ${value}.`,
              },
            ],
          },
        }
      );

      expect(result).toEqual({
        kind: "rejected",
        code: "tainted_parameter",
        message:
          "That value came from content you didn't type and can't be shown to you safely, so I can't use it in a fix.",
      });
      expect(mocks.writeStep).toHaveBeenCalledWith(
        admin,
        expect.anything(),
        expect.objectContaining({
          kind: "action_rejected",
          resultSummary: "tainted_parameter_undisplayable",
        })
      );
      expect(mocks.startRun).not.toHaveBeenCalled();
      expect(mocks.executePlan).not.toHaveBeenCalled();
    }
  );

  test.each([
    [
      "get_device_diagnostics",
      "external_untrusted",
      "your device's diagnostics",
    ],
    ["get_recent_sign_in_failures", "external_untrusted", "sign-in records"],
    [
      "count_similar_org_issues",
      "external_untrusted",
      "other tickets in your organization",
    ],
    ["get_ticket_history", "external_untrusted", "your ticket history"],
    ["get_account_status", "org_approved", "your organization's directory"],
    ["search_guides", "org_approved", "your organization's guides"],
    ["get_org_environment", "org_approved", "your organization's settings"],
    ["get_service_health", "vendor", "a service status page"],
    ["search_web", "community", "a community post"],
    ["search_web", "reference", "a reference page"],
    ["search_web", "vendor", "a web page"],
    ["screenshot", "external_untrusted", "a screenshot"],
    ["earlier reply", "external_untrusted", "an earlier reply"],
    ["unknown_tool", "community", "a tool result"],
  ] as const)(
    "labels tainted values from %s",
    async (source, trust, sourceLabel) => {
      mocks.readTier.mockResolvedValue("autorun");
      mocks.executePlan.mockResolvedValue({ status: "awaiting_consent" });
      mocks.writeStep.mockResolvedValue("step-1");
      vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "true");
      const admin = actionAdmin({
        approval: {
          id: "approval-tainted",
          run_id: "run-1",
          step_id: "plan-step-1",
          capability_id: "send_password_reset_link",
          parameter_hash: "hash-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      });
      const result = await proposeAction(
        admin as never,
        proposalSession(),
        {
          capabilityId: "send_password_reset_link",
          params: { ticketId: "Contoso-Secure-5G" },
          hypothesisId: "ev-1",
          rationale: "Ask about the reported device.",
        },
        {
          actor: "requester_agent:session-1",
          evidence: [{ id: "ev-1", tool: "get_device_diagnostics" }],
          provenance: {
            userTexts: [],
            items: [
              {
                evidenceId: "ev-1",
                source,
                trust,
                text: "The value is Contoso-Secure-5G.",
              },
            ],
          },
          assurance: {
            level: "A3",
            method: "supabase_mfa",
            authAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }
      );

      expect(result).toMatchObject({
        kind: "consent_required",
        card: {
          requiresReconfirm: true,
          tainted: [
            {
              param: "ticketId",
              value: "Contoso-Secure-5G",
              source: sourceLabel,
              trust,
            },
          ],
        },
      });
    }
  );

  test("escalates when tainted consent could not be recorded", async () => {
    mocks.readTier.mockResolvedValue("autorun");
    mocks.executePlan.mockResolvedValue({ status: "awaiting_consent" });
    const admin = actionAdmin({
      approval: {
        id: "approval-tainted",
        run_id: "run-1",
        step_id: "plan-step-1",
        capability_id: "device_flush_dns",
        parameter_hash: "hash-1",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const result = await proposeAction(
      admin as never,
      proposalSession(),
      {
        capabilityId: "device_flush_dns",
        params: { hostname: "Contoso-Secure-5G" },
        hypothesisId: "ev-1",
        rationale: "The device has a DNS failure.",
      },
      {
        actor: "requester_agent:session-1",
        evidence: [{ id: "ev-1", tool: "get_service_health" }],
        provenance: {
          userTexts: [],
          items: [
            {
              evidenceId: "ev-1",
              source: "get_service_health",
              trust: "vendor",
              text: "DNS outage for Contoso-Secure-5G.",
            },
          ],
        },
      }
    );

    expect(result).toEqual({
      kind: "escalate",
      reason: "taint_record_failed",
    });
    expect(mocks.escalate).toHaveBeenCalledWith(
      admin,
      expect.anything(),
      "taint_record_failed",
      expect.any(String)
    );
  });

  test("rejects top-level and nested target fields before execution", async () => {
    const admin = {} as never;
    const context = {
      actor: "requester_agent:session-1",
      evidence: [],
      provenance: { userTexts: [], items: [] },
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
          table === "agent_steps"
            ? { policy_decision: "clean" }
            : table === "approval_requests"
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
      from: (table: string) =>
        query(table === "agent_steps" ? { policy_decision: "clean" } : null),
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

  test("does not consume approval when tainted consent lacks reconfirmation", async () => {
    const target: AgentSession = {
      ...session,
      resolution_run_id: "run-1",
      pending_approval_id: "approval-tainted",
    };
    const approval = {
      id: "approval-tainted",
      run_id: "run-1",
      step_id: "step-1",
      capability_id: "device_flush_dns",
      parameter_hash: "hash-1",
      status: "requested",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const admin = {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({
            data:
              table === "agent_steps"
                ? { policy_decision: "reconfirm" }
                : approval,
            error: null,
          }),
        };
        return chain;
      },
    } as never;

    const result = await decideConsent(
      admin,
      target,
      {
        approvalRequestId: "approval-tainted",
        decision: "approve",
        userId: "user-1",
      },
      vi.fn(),
      new AbortController().signal
    );

    expect(result).toBe("reconfirm_required");
    expect(mocks.consumeAiConsent).not.toHaveBeenCalled();
    expect(mocks.resumeAfterApproval).not.toHaveBeenCalled();
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      target,
      expect.objectContaining({
        kind: "action_rejected",
        consentId: "approval-tainted",
        resultSummary: "Re-confirm required.",
      })
    );
  });

  test("consumes tainted approval only after explicit reconfirmation", async () => {
    const target: AgentSession = {
      ...session,
      resolution_run_id: "run-1",
      pending_approval_id: "approval-tainted",
    };
    const approval = {
      id: "approval-tainted",
      run_id: "run-1",
      step_id: "step-1",
      capability_id: "device_flush_dns",
      parameter_hash: "hash-1",
      status: "requested",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const admin = {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({
            data:
              table === "agent_steps"
                ? { policy_decision: "reconfirm" }
                : table === "approval_requests"
                  ? approval
                  : { id: "run-1", status: "awaiting_consent" },
            error: null,
          }),
        };
        return chain;
      },
    } as never;
    mocks.consumeAiConsent.mockResolvedValue({
      ok: true,
      request: approval,
    });
    mocks.resumeAfterApproval.mockResolvedValue({
      ...run,
      status: "escalated",
      escalation_reason: "execution_denied",
    });

    await decideConsent(
      admin,
      target,
      {
        approvalRequestId: "approval-tainted",
        decision: "approve",
        userId: "user-1",
        reconfirmTainted: true,
      },
      vi.fn(),
      new AbortController().signal
    );

    expect(mocks.consumeAiConsent).toHaveBeenCalledWith(
      admin,
      "approval-tainted",
      "user-1",
      "grant"
    );
    expect(mocks.resumeAfterApproval).toHaveBeenCalledTimes(1);
  });

  test("leaves a pending approval unconsumed when consent needs step-up", async () => {
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "true");
    const target: AgentSession = {
      ...session,
      resolution_run_id: "run-1",
      pending_approval_id: "approval-1",
    };
    const admin = actionAdmin({
      approval: {
        id: "approval-1",
        run_id: "run-1",
        capability_id: "send_password_reset_link",
        status: "requested",
      },
    });
    const events: unknown[] = [];

    const result = await decideConsent(
      admin as never,
      target,
      {
        approvalRequestId: "approval-1",
        decision: "approve",
        userId: "user-1",
        assurance: {
          level: "A1",
          method: "session",
          authAt: null,
          expiresAt: null,
        },
      },
      (event) => events.push(event),
      new AbortController().signal
    );

    expect(result).toBe("invalid");
    expect(mocks.consumeAiConsent).not.toHaveBeenCalled();
    expect(events).toContainEqual({
      type: "step_up_required",
      card: {
        capabilityId: "send_password_reset_link",
        requiredLevel: "A3",
        currentLevel: "A1",
        stepUpUrl: "/auth/step-up?next=/assistant",
      },
    });
    expect(mocks.writeStep).toHaveBeenCalledWith(
      admin,
      target,
      expect.objectContaining({ kind: "step_up_required" })
    );
  });
});
