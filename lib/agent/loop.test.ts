import { afterEach, describe, expect, test, vi } from "vitest";
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

const propose = (id = "proposal") => ({
  kind: "tool_use" as const,
  id,
  name: "propose_action",
  input: {
    capability_id: "device_flush_dns",
    params: {},
    hypothesis_id: "ev-1",
    rationale: "The connection may need a refresh.",
  },
  summary: "Considering a fix.",
});

const serviceIncident = {
  source: "microsoft365" as const,
  incidentId: "EX123",
  service: "Exchange Online",
  title: "Mail delivery is delayed",
  impact: "outage" as const,
  startedAt: null,
  url: "https://admin.microsoft.com/Adminportal/Home#/servicehealth",
};

afterEach(() => vi.unstubAllEnvs());

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

  test.each(["tier_shadow", "tier_disabled"] as const)(
    "emits a requester-visible message for %s action rejection",
    async (code) => {
      const message =
        code === "tier_shadow"
          ? "This fix cannot be applied automatically yet; here is how to do it manually."
          : "This fix is not enabled for your organization.";
      const harness = createAgentEvalHarness({
        outputs: [
          {
            kind: "tool_use",
            id: "action-1",
            name: "propose_action",
            input: {
              capability_id: "device_flush_dns",
              params: {},
              hypothesis_id: "ev-1",
              rationale: "Diagnostics indicate a network issue.",
            },
            summary: "I can propose a safe fix.",
          },
          {
            kind: "final",
            text: "Here is the manual guidance.",
            confidence: 0.9,
            summary: "Manual guidance.",
          },
        ],
        proposeActionOutcome: {
          kind: "rejected",
          code,
          message,
        },
      });

      await harness.run();

      expect(harness.events).toContainEqual({
        type: "tool_result_summary",
        tool: "propose_action",
        summary: message,
      });
    }
  );

  test("escalates on the third identical rejected action proposal", async () => {
    const rejected = {
      kind: "rejected" as const,
      code: "unknown_hypothesis" as const,
      message: "That evidence is not available in this session.",
    };
    const proposal = (id: string) => ({
      kind: "tool_use" as const,
      id,
      name: "propose_action",
      input: {
        capability_id: "device_flush_dns",
        params: {},
        hypothesis_id: "missing-evidence",
        rationale: "Diagnostics indicate a network issue.",
      },
      summary: "I can propose a safe fix.",
    });
    const harness = createAgentEvalHarness({
      outputs: [proposal("one"), proposal("two"), proposal("three")],
      proposeActionOutcome: rejected,
    });

    await harness.run();

    expect(harness.events.at(-1)).toMatchObject({
      type: "escalated",
      reason: "loop_detected",
    });
    expect(
      harness.steps.filter((step) => step.kind === "action_rejected")
    ).toHaveLength(3);
    expect(
      harness.steps.find((step) => step.kind === "action_rejected")
    ).toMatchObject({
      kind: "action_rejected",
      toolName: "propose_action",
    });
  });

  test("persists a matching incident and blocks a later proposal", async () => {
    vi.stubEnv("HELP_DESK_SERVICE_HEALTH_ENABLED", "true");
    const harness = createAgentEvalHarness({
      outputs: [
        use("health", "get_service_health", {
          symptom: "Outlook email is unavailable",
        }),
        propose(),
        {
          kind: "final",
          text: "A known service incident may explain this.",
          confidence: 0.9,
          summary: "Known incident",
        },
      ],
      toolResults: [
        {
          ok: true,
          value: {
            checked: true,
            matched: [serviceIncident],
            otherActive: 0,
            sources: [{ source: "microsoft365", ok: true }],
            checkedAt: "2026-10-04T12:00:00.000Z",
          },
          modelText:
            '<untrusted_data source="health">incident</untrusted_data>',
          userSummary:
            "1 active incident may explain this: Exchange Online (Microsoft 365).",
        },
      ],
    });
    await harness.run();
    expect(harness.proposeActionCalls).toBe(0);
    expect(harness.steps).toContainEqual(
      expect.objectContaining({
        kind: "service_incident",
        resultSummary: "microsoft365:EX123",
      })
    );
    expect(harness.steps).toContainEqual(
      expect.objectContaining({
        kind: "action_rejected",
        resultSummary: expect.stringContaining("service_incident_active"),
      })
    );
    expect(harness.events).toContainEqual({
      type: "service_incident",
      incidents: [
        {
          source: "microsoft365",
          incidentId: "EX123",
          service: "Exchange Online",
          title: "Mail delivery is delayed",
          impact: "outage",
          url: "https://admin.microsoft.com/Adminportal/Home#/servicehealth",
        },
      ],
    });
  });

  test("blocks proposals when a service incident already exists in the session", async () => {
    vi.stubEnv("HELP_DESK_SERVICE_HEALTH_ENABLED", "true");
    const harness = createAgentEvalHarness({
      serviceIncidentActive: true,
      outputs: [
        propose(),
        {
          kind: "final",
          text: "Actions remain paused.",
          confidence: 0.9,
          summary: "Incident active",
        },
      ],
    });
    await harness.run();
    expect(harness.proposeActionCalls).toBe(0);
    expect(harness.steps).toContainEqual(
      expect.objectContaining({
        kind: "action_rejected",
        resultSummary: expect.stringContaining("service_incident_active"),
      })
    );
  });
});
