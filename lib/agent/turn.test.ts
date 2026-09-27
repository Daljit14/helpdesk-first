import { describe, expect, test } from "vitest";
import { createAgentEvalHarness } from "./eval-harness";

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

  test("continues with a synthetic turn after consent decline", async () => {
    const harness = createAgentEvalHarness({
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
});
