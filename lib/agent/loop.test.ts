import { describe, expect, test } from "vitest";
import { createAgentEvalHarness } from "./eval-harness";

const use = (id: string, name = "search_guides", input: unknown = {}) => ({
  kind: "tool_use" as const,
  id,
  name,
  input,
  summary: "Checking a source.",
});

const result = {
  ok: true as const,
  value: [{ slug: "wifi-disconnecting" }],
  modelText: '<untrusted_data source="tool">full result</untrusted_data>',
  userSummary: "1 guide found: wifi-disconnecting",
};

describe("requester agent loop", () => {
  test("keeps a successful final session active and sends full tool text", async () => {
    const harness = createAgentEvalHarness({
      message: "Wi-Fi keeps dropping.",
      outputs: [
        use("guides"),
        { kind: "final", text: "Try this.", confidence: 0.9, summary: "Done" },
      ],
      toolResults: [result],
    });
    await harness.run();
    expect(harness.session.status).toBe("active");
    expect(harness.steps.map((step) => step.kind)).toContain("final");
    expect(harness.model.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool_result",
      content: `${result.modelText}\n[evidence id: ev-1]`,
    });
    expect(harness.events.at(-1)).toMatchObject({
      type: "final_answer",
      text: "Try this.",
    });
  });

  test("loads prior context before the new user message", async () => {
    const context = [
      { role: "user" as const, content: "Earlier question" },
      { role: "assistant" as const, content: "Earlier answer" },
    ];
    const harness = createAgentEvalHarness({
      outputs: [
        {
          kind: "final",
          text: "Context used.",
          confidence: 0.9,
          summary: "Done",
        },
      ],
      context,
    });
    await harness.run();
    expect(harness.model.requests[0]?.messages).toEqual(
      expect.arrayContaining(context)
    );
  });

  test("caches the second duplicate and escalates on the third", async () => {
    const harness = createAgentEvalHarness({
      outputs: [use("one"), use("two"), use("three")],
      toolResults: [result, result],
    });
    await harness.run();
    expect(harness.toolCalls).toBe(1);
    expect(harness.events.at(-1)).toMatchObject({
      type: "escalated",
      reason: "loop_detected",
    });
  });

  test("escalates low confidence and strips prohibited claims", async () => {
    const low = createAgentEvalHarness({
      outputs: [
        { kind: "final", text: "Maybe.", confidence: 0.79, summary: "Low" },
      ],
    });
    await low.run();
    expect(low.events.at(-1)).toMatchObject({
      type: "escalated",
      reason: "low_confidence",
    });

    const claim = createAgentEvalHarness({
      outputs: [
        {
          kind: "final",
          text: "The issue is fixed.",
          confidence: 0.9,
          summary: "Done",
        },
      ],
    });
    await claim.run();
    expect(claim.steps).toContainEqual(
      expect.objectContaining({ kind: "claim_stripped" })
    );
    expect(claim.events.at(-1)).toMatchObject({
      type: "final_answer",
      text: "The issue is may have addressed.",
    });
  });

  test("escalates after two invalid model outputs", async () => {
    const harness = createAgentEvalHarness({
      outputs: [
        { kind: "invalid", raw: "nope" },
        { kind: "invalid", raw: "still nope" },
      ],
    });
    await harness.run();
    expect(harness.events.at(-1)).toMatchObject({
      type: "escalated",
      reason: "model_invalid_output",
    });
  });

  test("halts injection and does not call a later tool", async () => {
    const harness = createAgentEvalHarness({
      outputs: [use("injection"), use("later")],
      toolResults: [
        {
          ok: false,
          code: "injection_in_tool_output",
          modelText: "blocked",
          userSummary: "A tool result was blocked for safety.",
        },
      ],
    });
    await harness.run();
    expect(harness.toolCalls).toBe(1);
    expect(harness.events.at(-1)).toMatchObject({
      type: "halted",
      reason: "injection_in_tool_output",
    });
  });
});
