import { afterEach, describe, expect, test, vi } from "vitest";
import { createAgentEvalHarness } from "./eval-harness";

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
