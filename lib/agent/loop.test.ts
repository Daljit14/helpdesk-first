import { afterEach, describe, expect, test, vi } from "vitest";
import { createAgentEvalHarness } from "./eval-harness";
import { runAgentTurn, type AgentLoopDeps } from "./loop";
import type { AgentModel, AgentModelOutput } from "./model";
import type { AgentEvent, AgentSession } from "./types";

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

function loopSession(overrides: Partial<AgentSession> = {}): AgentSession {
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
    ...overrides,
  };
}

function directLoopDeps(overrides: Partial<AgentLoopDeps> = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const recordedCalls: Parameters<AgentLoopDeps["recordModelCall"]>[0][] = [];
  let orgBudgetChecks = 0;
  let modelSelections = 0;
  const deps: Partial<AgentLoopDeps> = {
    budgetExceeded: () => null,
    readKillSwitches: async () => ({
      global: false,
      organization: false,
      capability: false,
      provider: false,
      anyActive: false,
      envDisabled: false,
      explicit: false,
      reasons: [],
    }),
    checkDailyBudget: async () => true,
    checkOrgCostBudget: async () => {
      orgBudgetChecks += 1;
      return true;
    },
    recordModelCall: (call) => recordedCalls.push(call),
    createModel: () => {
      modelSelections += 1;
      return {
        next: async () => ({
          kind: "final",
          text: "Here is a safe answer.",
          confidence: 0.9,
          summary: "Answer",
        }),
      };
    },
    updateSession: async (_admin, session, values) => {
      updates.push(values);
      Object.assign(session, values);
    },
    writeStep: async () => {},
    loadContext: async () => [],
    loadEvidence: async () => [],
    runTool: async () => ({
      ok: true,
      value: {},
      modelText: "Tool result.",
      userSummary: "Tool result.",
    }),
    escalate: async (_admin, session, reason) => {
      session.status = "escalated";
      session.resolution_summary = reason;
      return "ticket-1";
    },
    halt: async (_admin, session, reason) => {
      session.status = "halted";
      session.halt_reason = reason;
      return "ticket-1";
    },
    alert: async () => {},
    proposeAction: async () => ({
      kind: "rejected",
      code: "unknown_hypothesis",
      message: "That evidence is unavailable.",
    }),
    hasServiceIncident: async () => false,
    serviceHealthEnabled: false,
    costTrackingEnabled: false,
    ...overrides,
  };
  return {
    deps,
    updates,
    recordedCalls,
    get orgBudgetChecks() {
      return orgBudgetChecks;
    },
    get modelSelections() {
      return modelSelections;
    },
  };
}

async function runDirectLoop(input: {
  session?: AgentSession;
  routing?: { screenshotAttached?: boolean; failedVerification?: boolean };
  deps: Partial<AgentLoopDeps>;
  events?: AgentEvent[];
}): Promise<void> {
  await runAgentTurn({
    admin: {} as never,
    session: input.session ?? loopSession(),
    userMessage: "Please help me troubleshoot this support issue.",
    routing: input.routing,
    emit: (event) => input.events?.push(event),
    signal: new AbortController().signal,
    deps: input.deps,
  });
}

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

  test("routes screenshot turns to the planner without changing prompt tools", async () => {
    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AGENT_PLANNER_MODEL", "claude-sonnet-5");
    vi.stubEnv("HELP_DESK_AI_MODEL", "claude-haiku-4-5-20251001");
    const selections: string[] = [];
    const calls: Record<
      "default" | "planner",
      Array<Parameters<AgentModel["next"]>[0]>
    > = { default: [], planner: [] };
    const finalOutput: AgentModelOutput = {
      kind: "final",
      text: "Here is a safe answer.",
      confidence: 0.9,
      summary: "Answer",
    };
    const deps = directLoopDeps({
      createModel: (_message, modelId) => {
        selections.push(modelId ?? "missing");
        const tier = modelId === "claude-sonnet-5" ? "planner" : "default";
        return {
          next: async (input) => {
            calls[tier].push(input);
            return finalOutput;
          },
        };
      },
    });

    await runDirectLoop({ deps: deps.deps });
    await runDirectLoop({
      deps: deps.deps,
      routing: { screenshotAttached: true },
    });

    expect(selections).toEqual([
      "claude-haiku-4-5-20251001",
      "claude-sonnet-5",
    ]);
    expect(calls.default).toHaveLength(1);
    expect(calls.planner).toHaveLength(1);
    const parameters = (input: Parameters<AgentModel["next"]>[0]) => ({
      system: input.system,
      tools: input.tools,
      maxTokens: input.maxTokens,
    });
    expect(parameters(calls.planner[0])).toEqual(parameters(calls.default[0]));
  });

  test("uses only the default model when routing is disabled", async () => {
    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "false");
    vi.stubEnv("HELP_DESK_AGENT_PLANNER_MODEL", "claude-sonnet-5");
    vi.stubEnv("HELP_DESK_AI_MODEL", "claude-haiku-4-5-20251001");
    const selections: string[] = [];
    const deps = directLoopDeps({
      createModel: (_message, modelId) => {
        selections.push(modelId ?? "missing");
        return {
          next: async () => ({
            kind: "final",
            text: "Here is a safe answer.",
            confidence: 0.9,
            summary: "Answer",
          }),
        };
      },
    });

    await runDirectLoop({
      deps: deps.deps,
      routing: { screenshotAttached: true },
    });

    expect(selections).toEqual(["claude-haiku-4-5-20251001"]);
  });

  test("leaves token and cost fields, org budget, and telemetry untouched when tracking is off", async () => {
    const deps = directLoopDeps({
      createModel: () => ({
        next: async () => ({
          kind: "final",
          text: "Here is a safe answer.",
          confidence: 0.9,
          summary: "Answer",
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
          model: "claude-haiku-4-5-20251001",
        }),
      }),
    });

    await runDirectLoop({ deps: deps.deps });

    expect(
      deps.updates.some(
        (update) =>
          "token_count" in update ||
          "cost_micros" in update ||
          "planner_turn_count" in update
      )
    ).toBe(false);
    expect(deps.orgBudgetChecks).toBe(0);
    expect(deps.recordedCalls).toEqual([]);
  });

  test("accumulates usage and cost on planner calls when tracking is enabled", async () => {
    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AGENT_PLANNER_MODEL", "claude-sonnet-5");
    const session = loopSession({
      token_count: 7,
      cost_micros: 20,
      planner_turn_count: 1,
    });
    const deps = directLoopDeps({
      costTrackingEnabled: true,
      createModel: () => ({
        next: async () => ({
          kind: "final",
          text: "Here is a safe answer.",
          confidence: 0.9,
          summary: "Answer",
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationInputTokens: 10,
            cacheReadInputTokens: 20,
          },
          model: "claude-sonnet-5",
        }),
      }),
    });

    await runDirectLoop({
      session,
      deps: deps.deps,
      routing: { screenshotAttached: true },
    });

    expect(deps.orgBudgetChecks).toBe(1);
    expect(session).toMatchObject({
      token_count: 187,
      cost_micros: 749,
      planner_turn_count: 2,
    });
    expect(deps.recordedCalls).toEqual([
      {
        organizationId: "org-1",
        model: "claude-sonnet-5",
        route: "agent_planner",
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationInputTokens: 10,
          cacheReadInputTokens: 20,
        },
        costMicros: 729,
      },
    ]);
    expect(deps.updates).toContainEqual({
      token_count: 187,
      cost_micros: 749,
      planner_turn_count: 2,
    });
  });

  test("escalates before a model call when the organization cost cap is reached", async () => {
    vi.stubEnv("HELP_DESK_AGENT_COST_TRACKING_ENABLED", "true");
    const events: AgentEvent[] = [];
    let created = false;
    const deps = directLoopDeps({
      costTrackingEnabled: true,
      checkOrgCostBudget: async () => false,
      createModel: () => {
        created = true;
        return {
          next: async () => ({
            kind: "final",
            text: "Should not run.",
            confidence: 0.9,
            summary: "No call",
          }),
        };
      },
    });

    await runDirectLoop({ deps: deps.deps, events });

    expect(created).toBe(false);
    expect(events).toContainEqual({
      type: "escalated",
      ticketId: "ticket-1",
      reason: "budget:org_cost",
    });
  });

  test("keeps denylist enforcement active on the planner tier", async () => {
    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AGENT_PLANNER_MODEL", "claude-sonnet-5");
    const events: AgentEvent[] = [];
    let modelCalls = 0;
    const deps = directLoopDeps({
      createModel: () => ({
        next: async () => {
          modelCalls += 1;
          return {
            kind: "tool_use",
            id: "unsafe",
            name: "grant_group_access",
            input: {},
            summary: "Attempting a restricted action.",
          };
        },
      }),
    });

    await runDirectLoop({
      deps: deps.deps,
      events,
      routing: { screenshotAttached: true },
    });

    expect(modelCalls).toBe(1);
    expect(events).toContainEqual({
      type: "halted",
      ticketId: "ticket-1",
      reason: "model_proposed_denylisted",
    });
  });

  test("keeps service-incident action blocking active on the planner tier", async () => {
    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AGENT_PLANNER_MODEL", "claude-sonnet-5");
    vi.stubEnv("HELP_DESK_REQUESTER_AGENT_ENABLED", "true");
    vi.stubEnv("HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST", "org-1");
    vi.stubEnv("HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED", "true");
    const steps: Array<{ kind: string; resultSummary?: string }> = [];
    let actionCalls = 0;
    let modelCalls = 0;
    const model: AgentModel = {
      next: async () => {
        modelCalls += 1;
        return modelCalls === 1
          ? propose("proposal")
          : {
              kind: "final",
              text: "Here is safe guidance.",
              confidence: 0.9,
              summary: "Guidance",
            };
      },
    };
    const deps = directLoopDeps({
      createModel: () => model,
      writeStep: async (_admin, _session, step) => {
        steps.push(step);
      },
      proposeAction: async () => {
        actionCalls += 1;
        return {
          kind: "rejected",
          code: "unknown_hypothesis",
          message: "Should not execute.",
        };
      },
      hasServiceIncident: async () => true,
      serviceHealthEnabled: true,
    });

    await runDirectLoop({
      deps: deps.deps,
      routing: { screenshotAttached: true },
    });

    expect(modelCalls).toBe(2);
    expect(actionCalls).toBe(0);
    expect(steps).toContainEqual(
      expect.objectContaining({
        kind: "action_rejected",
        resultSummary: expect.stringContaining("service_incident_active"),
      })
    );
  });
});
