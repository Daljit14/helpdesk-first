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
});
