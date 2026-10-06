import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAgentEvalHarness } from "./eval-harness";
import { handleAgentRequest, type AgentTurnDeps } from "./turn";
import type { AgentEvent, AgentSession } from "./types";

const userStepMocks = vi.hoisted(() => ({
  getIssueBySlug: vi.fn(),
  getIssueStepPolicies: vi.fn(),
}));

vi.mock("@/lib/search", () => ({
  getIssueBySlug: userStepMocks.getIssueBySlug,
}));
vi.mock("@/lib/investigation/policy", () => ({
  getIssueStepPolicies: userStepMocks.getIssueStepPolicies,
}));

type TurnRunInput = Parameters<NonNullable<AgentTurnDeps["runAgentTurn"]>>[0];

function turnSession(): AgentSession {
  return {
    id: "session-1",
    organization_id: "org-1",
    requester_id: "requester-1",
    status: "active",
    started_at: new Date().toISOString(),
    ended_at: null,
    last_user_message: null,
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
}

beforeEach(() => {
  userStepMocks.getIssueBySlug.mockReturnValue({
    id: "wifi-disconnecting",
    title: "Wi-Fi keeps disconnecting",
  });
  userStepMocks.getIssueStepPolicies.mockReturnValue([
    { text: "Restart your router and reconnect to Wi-Fi." },
  ]);
});

afterEach(() => vi.unstubAllEnvs());

describe("requester agent turn dispatch", () => {
  test("escalates a human request without calling the model", async () => {
    const harness = createAgentEvalHarness({
      message: "I need a human.",
      humanRequested: true,
      outputs: [],
    });

    await harness.run();

    expect(harness.model.calls).toBe(0);
    expect(harness.events).toContainEqual({
      type: "escalated",
      ticketId: "00000000-0000-4000-8000-000000000004",
      reason: "user_requested_human",
    });
    expect(harness.session.status).toBe("escalated");
  });

  test("escalates a human request after a prior terminal error step", async () => {
    const harness = createAgentEvalHarness({
      message: "Please connect me with a human.",
      humanRequested: true,
      outputs: [],
    });
    harness.steps.push({
      kind: "error",
      resultSummary: "Anthropic agent request failed",
    });

    await harness.run();

    expect(harness.events).toContainEqual({
      type: "escalated",
      ticketId: "00000000-0000-4000-8000-000000000004",
      reason: "user_requested_human",
    });
    expect(harness.session.status).toBe("escalated");
  });

  test("continues with a synthetic turn after consent decline", async () => {
    vi.stubEnv("HELP_DESK_SERVICE_HEALTH_ENABLED", "true");
    const harness = createAgentEvalHarness({
      serviceIncidentActive: true,
      outputs: [
        {
          kind: "final",
          text: "I can keep troubleshooting.",
          confidence: 0.9,
          summary: "Next hypothesis",
        },
      ],
      consent: { approvalRequestId: "approval-1", decision: "decline" },
      decideConsentResult: "declined",
    });
    await harness.run();
    expect(harness.model.calls).toBe(1);
    expect(harness.model.requests[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "User declined `device_flush_dns`",
    });
    expect(harness.gatewayCalls).toBe(0);
  });

  test("continues with a synthetic turn after a failed verification", async () => {
    const harness = createAgentEvalHarness({
      outputs: [
        {
          kind: "final",
          text: "I can try another fix.",
          confidence: 0.9,
          summary: "Next hypothesis",
        },
      ],
      consent: { approvalRequestId: "approval-1", decision: "approve" },
      decideConsentResult: "executed_verified_failed",
    });
    await harness.run();
    expect(harness.model.requests[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content:
        "The fix `device_flush_dns` was rolled back after verification failed",
    });
  });

  test("continues with a synthetic turn after the requester says no", async () => {
    const harness = createAgentEvalHarness({
      outputs: [
        {
          kind: "final",
          text: "I can try another fix.",
          confidence: 0.9,
          summary: "Next hypothesis",
        },
      ],
      confirm: "no",
      confirmOutcomeResult: "next_hypothesis",
    });
    await harness.run();
    expect(harness.model.requests[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Still broken after `the attempted fix`",
    });
  });

  test("marks failed verification and next-hypothesis re-entries for routing, not declines", async () => {
    const failedInput: TurnRunInput[] = [];
    await handleAgentRequest({
      admin: {} as never,
      session: turnSession(),
      message: "Continue troubleshooting.",
      consent: { approvalRequestId: "approval-1", decision: "approve" },
      emit: () => {},
      signal: new AbortController().signal,
      deps: {
        decideConsent: async () => "executed_verified_failed",
        runAgentTurn: async (input) => {
          failedInput.push(input);
        },
      },
    });
    expect(failedInput[0]?.routing).toEqual({ failedVerification: true });

    const hypothesisInput: TurnRunInput[] = [];
    await handleAgentRequest({
      admin: {} as never,
      session: turnSession(),
      message: "It is still broken.",
      confirm: "no",
      emit: () => {},
      signal: new AbortController().signal,
      deps: {
        confirmOutcome: async () => "next_hypothesis",
        runAgentTurn: async (input) => {
          hypothesisInput.push(input);
        },
      },
    });
    expect(hypothesisInput[0]?.routing).toEqual({
      failedVerification: true,
    });

    const declineInput: TurnRunInput[] = [];
    await handleAgentRequest({
      admin: {} as never,
      session: turnSession(),
      message: "Continue troubleshooting.",
      consent: { approvalRequestId: "approval-1", decision: "decline" },
      emit: () => {},
      signal: new AbortController().signal,
      deps: {
        decideConsent: async () => "declined",
        runAgentTurn: async (input) => {
          declineInput.push(input);
        },
      },
    });
    expect(declineInput[0]?.routing?.failedVerification).toBeUndefined();
  });

  test("marks turns that include an accepted screenshot attachment", async () => {
    const runInputs: TurnRunInput[] = [];
    await handleAgentRequest({
      admin: {} as never,
      session: turnSession(),
      message: "What is shown here?",
      attachmentIds: ["attachment-1"],
      emit: () => {},
      signal: new AbortController().signal,
      deps: {
        intakeScreenshots: async () => ({
          ok: true,
          items: [
            {
              attachmentId: "attachment-1",
              modelText: "Screenshot text.",
              userSummary: "Screenshot text.",
              sha256: "sha256",
            },
          ],
        }),
        writeStep: async () => null,
        updateSession: async () => {},
        runAgentTurn: async (input) => {
          runInputs.push(input);
        },
      },
    });

    expect(runInputs[0]?.routing).toEqual({ screenshotAttached: true });
  });

  test.each([
    [
      "done",
      'User step result: done — the user completed "Restart your router and reconnect to Wi-Fi.". Ask whether the problem is solved; do not claim it is fixed.',
      undefined,
    ],
    [
      "didnt_work",
      `User step result: didn't work — "Restart your router and reconnect to Wi-Fi." did not help. Try the next hypothesis.`,
      { failedVerification: true },
    ],
    [
      "cant_do",
      `User step result: the user can't do "Restart your router and reconnect to Wi-Fi.". Offer a different approach or escalate.`,
      undefined,
    ],
  ] as const)(
    "records a %s user-step outcome and resumes the agent",
    async (outcome, expectedMessage, expectedRouting) => {
      let queryCount = 0;
      const query = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return this;
        },
        async maybeSingle() {
          queryCount += 1;
          return queryCount === 1
            ? { data: { params_hash: "wifi-disconnecting#0" }, error: null }
            : { data: null, error: null };
        },
      };
      const admin = { from: vi.fn(() => query) };
      const written: Array<Record<string, unknown>> = [];
      const runInputs: TurnRunInput[] = [];

      await handleAgentRequest({
        admin: admin as never,
        session: turnSession(),
        message: "",
        userStep: {
          stepId: "00000000-0000-4000-8000-000000000010",
          outcome,
        },
        emit: () => {},
        signal: new AbortController().signal,
        deps: {
          loadRequesterIdentifiers: async () => [],
          writeStep: async (_admin, _session, step) => {
            written.push(step);
            return null;
          },
          runAgentTurn: async (input) => {
            runInputs.push(input);
          },
        },
      });

      expect(admin.from).toHaveBeenCalledTimes(2);
      expect(written).toContainEqual({
        kind: "user_step_outcome",
        paramsHash: "00000000-0000-4000-8000-000000000010",
        resultSummary: outcome,
      });
      expect(runInputs[0]?.userMessage).toBe(expectedMessage);
      expect(runInputs[0]?.routing?.failedVerification).toBe(
        expectedRouting?.failedVerification
      );
    }
  );

  test("marks forgot-password step outcomes as trusted system events", async () => {
    const instruction =
      "Use the official password reset or account recovery option.";
    userStepMocks.getIssueBySlug.mockReturnValueOnce({
      id: "forgot-password",
      title: "Forgot password",
    });
    userStepMocks.getIssueStepPolicies.mockReturnValueOnce([
      { text: instruction },
    ]);
    let queryCount = 0;
    const query = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      limit() {
        return this;
      },
      async maybeSingle() {
        queryCount += 1;
        return queryCount === 1
          ? { data: { params_hash: "forgot-password#0" }, error: null }
          : { data: null, error: null };
      },
    };
    const runInputs: TurnRunInput[] = [];

    await handleAgentRequest({
      admin: { from: vi.fn(() => query) } as never,
      session: turnSession(),
      message: "",
      userStep: {
        stepId: "00000000-0000-4000-8000-000000000010",
        outcome: "done",
      },
      emit: () => {},
      signal: new AbortController().signal,
      deps: {
        writeStep: async () => null,
        runAgentTurn: async (input) => {
          runInputs.push(input);
        },
      },
    });

    expect(runInputs[0]?.trustedSystemEvent).toBe(true);
    expect(runInputs[0]?.userMessage).toContain(instruction);
  });

  test.each([
    ["missing offer", null, null],
    [
      "already answered offer",
      { params_hash: "wifi-disconnecting#0" },
      { id: "outcome-row" },
    ],
  ])(
    "rejects a %s as no longer available",
    async (_name, offered, existingOutcome) => {
      let queryCount = 0;
      const query = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return this;
        },
        async maybeSingle() {
          queryCount += 1;
          return {
            data: queryCount === 1 ? offered : existingOutcome,
            error: null,
          };
        },
      };
      const admin = { from: vi.fn(() => query) } as never;
      const events: AgentEvent[] = [];
      const runAgentTurn = vi.fn();
      const writeStep = vi.fn();

      await handleAgentRequest({
        admin,
        session: turnSession(),
        message: "",
        userStep: {
          stepId: "00000000-0000-4000-8000-000000000010",
          outcome: "done",
        },
        emit: (event) => events.push(event),
        signal: new AbortController().signal,
        deps: { runAgentTurn, writeStep },
      });

      expect(events).toContainEqual({
        type: "error",
        message: "That step is no longer available.",
        recoverable: true,
      });
      expect(runAgentTurn).not.toHaveBeenCalled();
      expect(writeStep).not.toHaveBeenCalled();
    }
  );

  test("rejects consent approval during an active service incident", async () => {
    vi.stubEnv("HELP_DESK_SERVICE_HEALTH_ENABLED", "true");
    const harness = createAgentEvalHarness({
      serviceIncidentActive: true,
      consent: { approvalRequestId: "approval-1", decision: "approve" },
      decideConsentResult: "executed_verified_passed",
      outputs: [],
    });
    await harness.run();
    expect(harness.gatewayCalls).toBe(0);
    expect(harness.steps).toContainEqual(
      expect.objectContaining({
        kind: "action_rejected",
        resultSummary: expect.stringContaining("service_incident_active"),
      })
    );
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: "error",
        recoverable: true,
      })
    );
  });

  test("records a kind-only reply_redacted step for guarded output", async () => {
    const apiKey = "sk-live_abcdef1234567890";
    const events: AgentEvent[] = [];
    const written: Array<{ kind: string; resultSummary?: string }> = [];

    await handleAgentRequest({
      admin: {} as never,
      session: turnSession(),
      message: "Can you help?",
      emit: (event) => events.push(event),
      signal: new AbortController().signal,
      deps: {
        loadRequesterIdentifiers: async () => [],
        runAgentTurn: async ({ emit }) => {
          emit({
            type: "final_answer",
            text: `Use this credential: ${apiKey}`,
            confidence: 0.95,
            evidence: [],
          });
        },
        writeStep: async (_admin, _session, step) => {
          written.push(step);
          return null;
        },
      },
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "final_answer",
        text: "Use this credential: [removed: credential]",
      })
    );
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual({
      kind: "reply_redacted",
      resultSummary: JSON.stringify({ kinds: ["api_key"], count: 1 }),
    });
    expect(JSON.stringify(written)).not.toContain(apiKey);
  });

  test("does not fail a turn when the redaction audit write throws", async () => {
    const events: AgentEvent[] = [];
    await expect(
      handleAgentRequest({
        admin: {} as never,
        session: turnSession(),
        message: "Can you help?",
        emit: (event) => events.push(event),
        signal: new AbortController().signal,
        deps: {
          loadRequesterIdentifiers: async () => [],
          runAgentTurn: async ({ emit }) => {
            emit({
              type: "final_answer",
              text: "Use token: ghp_abcdefghijklmnopqrstuv",
              confidence: 0.95,
              evidence: [],
            });
          },
          writeStep: async () => {
            throw new Error("migration unavailable");
          },
        },
      })
    ).resolves.toBeUndefined();

    expect(events).toContainEqual(
      expect.objectContaining({ type: "final_answer" })
    );
  });

  test("screenshot intake emits screenshot_received without blocking the turn", async () => {
    const harness = createAgentEvalHarness({
      outputs: [
        {
          kind: "final",
          text: "Your screenshot shows Password: Hunter2!Secret",
          confidence: 0.9,
          summary: "Screenshot reviewed.",
        },
      ],
      attachmentIds: ["00000000-0000-4000-8000-000000000015"],
      screenshotText: "Sign in\nPassword: Hunter2!Secret",
      visionEnabled: true,
      requesterIdentifiers: ["requester@example.test"],
    });

    await harness.run();

    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: "screenshot_received",
        attachmentId: "00000000-0000-4000-8000-000000000015",
        summary: expect.stringContaining("[removed: credential]"),
      })
    );
    expect(JSON.stringify(harness.events)).not.toContain("Hunter2!Secret");
    expect(harness.model.calls).toBe(1);
  });
});
