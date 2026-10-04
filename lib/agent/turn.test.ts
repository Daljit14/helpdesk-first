import { afterEach, describe, expect, test, vi } from "vitest";
import { createAgentEvalHarness } from "./eval-harness";
import { handleAgentRequest, type AgentTurnDeps } from "./turn";
import type { AgentSession } from "./types";

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
        writeStep: async () => {},
        updateSession: async () => {},
        runAgentTurn: async (input) => {
          runInputs.push(input);
        },
      },
    });

    expect(runInputs[0]?.routing).toEqual({ screenshotAttached: true });
  });

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
});
