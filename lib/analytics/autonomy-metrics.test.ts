import { describe, expect, test } from "vitest";
import {
  computeAutonomyMetrics,
  type AutonomyMetricsInput,
} from "./autonomy-metrics";

const window = {
  windowDays: 30,
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T23:59:59.999Z",
};

const session = (
  overrides: Partial<AutonomyMetricsInput["sessions"][number]> = {}
): AutonomyMetricsInput["sessions"][number] => ({
  id: "session-1",
  requesterId: "requester-1",
  status: "resolved",
  startedAt: "2026-01-02T00:00:00.000Z",
  endedAt: "2026-01-02T00:01:00.000Z",
  lastUserMessage: "How do I connect?",
  resolutionSummary: null,
  backingTicketId: "ticket-1",
  escalationTicketId: null,
  ...overrides,
});

const input = (
  overrides: Partial<AutonomyMetricsInput> = {}
): AutonomyMetricsInput => ({
  sessions: [session()],
  tickets: [{ id: "ticket-1", status: "Resolved", resolvedAt: null }],
  systemEvents: [],
  actions: [],
  steps: [],
  ...overrides,
});

describe("computeAutonomyMetrics", () => {
  test("returns zeros for an empty window", () => {
    expect(
      computeAutonomyMetrics(
        {
          sessions: [],
          tickets: [],
          systemEvents: [],
          actions: [],
          steps: [],
        },
        window
      )
    ).toMatchObject({
      sessions: 0,
      aiResolved: 0,
      aiResolutionRate: 0,
      falseResolved: 0,
      falseResolvedRate: 0,
      escalated: 0,
      escalationRate: 0,
      medianAiResolutionMs: 0,
      medianHumanResolutionMs: 0,
      unhandledIntents: [],
      unhandledIntentCount: 0,
      costTracking: false,
      totalCostMicros: 0,
      costPerAiResolutionMicros: null,
    });
  });

  test("counts only resolved sessions without staff touch as AI resolved", () => {
    const metrics = computeAutonomyMetrics(
      input({
        sessions: [
          session({ id: "clean" }),
          session({ id: "employee-event", backingTicketId: "ticket-2" }),
          session({ id: "agent-action", backingTicketId: "ticket-3" }),
        ],
        tickets: [
          { id: "ticket-1", status: "Resolved", resolvedAt: null },
          { id: "ticket-2", status: "Resolved", resolvedAt: null },
          { id: "ticket-3", status: "Resolved", resolvedAt: null },
        ],
        systemEvents: [
          {
            ticketId: "ticket-2",
            eventType: "comment.created",
            actorType: "employee",
            createdAt: "2026-01-02T00:00:30.000Z",
          },
        ],
        actions: [{ ticketId: "ticket-3", agentId: "employee-1" }],
      }),
      window
    );
    expect(metrics).toMatchObject({
      sessions: 3,
      aiResolved: 1,
      aiResolutionRate: 1 / 3,
    });
  });

  test("computes total spend and cost per AI resolution for the selected window", () => {
    const metrics = computeAutonomyMetrics(
      input({
        costTracking: true,
        sessions: [
          session({ id: "ai", costMicros: 125 }),
          session({
            id: "escalated",
            status: "escalated",
            backingTicketId: null,
            escalationTicketId: "ticket-2",
            costMicros: 75,
          }),
        ],
        tickets: [
          { id: "ticket-1", status: "Resolved", resolvedAt: null },
          { id: "ticket-2", status: "Open", resolvedAt: null },
        ],
      }),
      window
    );

    expect(metrics).toMatchObject({
      costTracking: true,
      totalCostMicros: 200,
      aiResolved: 1,
      costPerAiResolutionMicros: 200,
    });
  });

  test("returns null per-resolution cost when tracking is off or no AI resolution exists", () => {
    const trackingOff = computeAutonomyMetrics(
      input({
        sessions: [session({ costMicros: 500 })],
      }),
      window
    );
    expect(trackingOff).toMatchObject({
      costTracking: false,
      totalCostMicros: 0,
      costPerAiResolutionMicros: null,
    });

    const noAiResolution = computeAutonomyMetrics(
      input({
        costTracking: true,
        sessions: [
          session({
            status: "escalated",
            backingTicketId: null,
            escalationTicketId: "ticket-2",
            costMicros: 500,
          }),
        ],
      }),
      window
    );
    expect(noAiResolution).toMatchObject({
      costTracking: true,
      totalCostMicros: 500,
      aiResolved: 0,
      costPerAiResolutionMicros: null,
    });
  });

  test("marks a resolution false when the ticket reopens within seven days", () => {
    const metrics = computeAutonomyMetrics(
      input({
        systemEvents: [
          {
            ticketId: "ticket-1",
            eventType: "ticket.reopened",
            actorType: "user",
            createdAt: "2026-01-08T00:01:00.000Z",
          },
        ],
      }),
      window
    );
    expect(metrics.falseResolved).toBe(1);

    const outsideWindow = computeAutonomyMetrics(
      input({
        systemEvents: [
          {
            ticketId: "ticket-1",
            eventType: "ticket.reopened",
            actorType: "user",
            createdAt: "2026-01-10T00:01:01.000Z",
          },
        ],
      }),
      window
    );
    expect(outsideWindow.falseResolved).toBe(0);
  });

  test("counts requester feedback as a false-resolved signal", () => {
    const metrics = computeAutonomyMetrics(
      input({
        feedback: [
          {
            sessionId: "session-1",
            verdict: "still_broken",
            createdAt: "2026-01-03T00:00:00.000Z",
            text: "Still broken",
          },
        ],
      }),
      window
    );
    expect(metrics).toMatchObject({
      aiResolved: 1,
      falseResolved: 1,
      outcomeFeedback: 1,
      recentFeedback: [
        {
          sessionId: "session-1",
          verdict: "still_broken",
          text: "Still broken",
        },
      ],
    });
  });

  test("ignores feedback for sessions outside the window and excludes escalations from false-resolved", () => {
    const metrics = computeAutonomyMetrics(
      input({
        sessions: [
          session({
            id: "outside",
            startedAt: "2025-12-31T23:59:59.999Z",
          }),
          session({
            id: "escalated",
            status: "escalated",
            backingTicketId: null,
          }),
        ],
        feedback: [
          {
            sessionId: "outside",
            verdict: "came_back",
            createdAt: "2026-01-03T00:00:00.000Z",
            text: "Outside the session window",
          },
          {
            sessionId: "escalated",
            verdict: "other",
            createdAt: "2026-01-04T00:00:00.000Z",
            text: "Escalated session",
          },
        ],
      }),
      window
    );
    expect(metrics).toMatchObject({
      sessions: 1,
      aiResolved: 0,
      falseResolved: 0,
      outcomeFeedback: 1,
      recentFeedback: [{ sessionId: "escalated" }],
    });
  });

  test("returns newest recent feedback first, caps rows at twenty, and sanitizes text", () => {
    const feedback = Array.from({ length: 22 }, (_, index) => ({
      sessionId: "session-1",
      verdict: "other",
      createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      text: index === 21 ? `<img onerror="alert(1)">${"x".repeat(400)}` : null,
    }));
    const metrics = computeAutonomyMetrics(input({ feedback }), window);
    expect(metrics.outcomeFeedback).toBe(1);
    expect(metrics.recentFeedback).toHaveLength(20);
    expect(metrics.recentFeedback[0].createdAt).toBe(feedback[21].createdAt);
    expect(metrics.recentFeedback[0].text).toBe("x".repeat(300));
    expect(metrics.recentFeedback[0].text).not.toContain("<img");
  });

  test("marks a resolution false for overlapping follow-up guide results", () => {
    const metrics = computeAutonomyMetrics(
      input({
        sessions: [
          session({ endedAt: "2026-01-02T00:01:00.000Z" }),
          session({
            id: "follow-up",
            status: "abandoned",
            requesterId: "requester-1",
            startedAt: "2026-01-04T00:00:00.000Z",
            backingTicketId: null,
          }),
        ],
        steps: [
          {
            sessionId: "session-1",
            kind: "tool_result",
            toolName: "search_guides",
            resultSummary: "2 guides found: wifi, vpn",
            seq: 1,
          },
          {
            sessionId: "follow-up",
            kind: "tool_result",
            toolName: "search_guides",
            resultSummary: "1 guides found: vpn",
            seq: 1,
          },
        ],
      }),
      window
    );
    expect(metrics.falseResolved).toBe(1);

    const noOverlap = computeAutonomyMetrics(
      input({
        sessions: [
          session({ endedAt: "2026-01-02T00:01:00.000Z" }),
          session({
            id: "follow-up",
            status: "abandoned",
            requesterId: "requester-1",
            startedAt: "2026-01-04T00:00:00.000Z",
            backingTicketId: null,
          }),
        ],
        steps: [
          {
            sessionId: "session-1",
            kind: "tool_result",
            toolName: "search_guides",
            resultSummary: "1 guides found: wifi",
            seq: 1,
          },
          {
            sessionId: "follow-up",
            kind: "tool_result",
            toolName: "search_guides",
            resultSummary: "1 guides found: vpn",
            seq: 1,
          },
        ],
      }),
      window
    );
    expect(noOverlap.falseResolved).toBe(0);
  });

  test("normalizes escalation reasons and orders the top five", () => {
    const reasons = [
      "budget:model_turns",
      "requester_agent_tripwire:prompt",
      "manual_handoff",
      "manual_handoff",
      "manual_handoff",
      "unknown-reason",
      "unknown-reason",
      "unknown-reason",
      "unknown-reason",
      "another-reason",
    ].map((resolutionSummary, index) =>
      session({
        id: `escalated-${index}`,
        status: index === 0 ? "halted" : "escalated",
        resolutionSummary,
        backingTicketId: null,
        escalationTicketId: null,
      })
    );
    const metrics = computeAutonomyMetrics(
      input({ sessions: reasons, tickets: [] }),
      window
    );
    expect(metrics.escalationReasons).toEqual([
      { reason: "unknown-reason", count: 4 },
      { reason: "manual_handoff", count: 3 },
      { reason: "another-reason", count: 1 },
      { reason: "budget", count: 1 },
      { reason: "tripwire", count: 1 },
    ]);
  });

  test("computes odd and even medians", () => {
    const odd = computeAutonomyMetrics(
      input({
        sessions: [
          session({
            id: "one",
            startedAt: "2026-01-02T00:00:00.000Z",
            endedAt: "2026-01-02T00:01:00.000Z",
          }),
          session({
            id: "three",
            startedAt: "2026-01-03T00:00:00.000Z",
            endedAt: "2026-01-03T00:03:00.000Z",
          }),
          session({
            id: "five",
            startedAt: "2026-01-04T00:00:00.000Z",
            endedAt: "2026-01-04T00:05:00.000Z",
          }),
        ],
      }),
      window
    );
    expect(odd.medianAiResolutionMs).toBe(180_000);

    const even = computeAutonomyMetrics(
      input({
        sessions: [
          session({
            id: "two",
            status: "escalated",
            startedAt: "2026-01-02T00:00:00.000Z",
            endedAt: "2026-01-02T00:01:00.000Z",
            backingTicketId: null,
            escalationTicketId: "ticket-2",
          }),
          session({
            id: "four",
            status: "halted",
            startedAt: "2026-01-03T00:00:00.000Z",
            endedAt: "2026-01-03T00:01:00.000Z",
            backingTicketId: null,
            escalationTicketId: "ticket-4",
          }),
        ],
        tickets: [
          {
            id: "ticket-2",
            status: "Resolved",
            resolvedAt: "2026-01-02T00:02:00.000Z",
          },
          {
            id: "ticket-4",
            status: "Resolved",
            resolvedAt: "2026-01-03T00:04:00.000Z",
          },
        ],
      }),
      window
    );
    expect(even.medianHumanResolutionMs).toBe(180_000);
  });

  test("requires an empty guide result and no action for unhandled intents", () => {
    const metrics = computeAutonomyMetrics(
      input({
        sessions: [
          session({
            id: "empty",
            status: "abandoned",
            lastUserMessage: "  <b>Need help</b> https://example.com",
          }),
          session({ id: "action", status: "abandoned" }),
        ],
        steps: [
          {
            sessionId: "empty",
            kind: "tool_result",
            toolName: "search_guides",
            resultSummary: "0 guides found",
            seq: 1,
          },
          {
            sessionId: "action",
            kind: "tool_result",
            toolName: "search_guides",
            resultSummary: "0 guides found",
            seq: 1,
          },
          {
            sessionId: "action",
            kind: "action_proposed",
            toolName: "propose_action",
            resultSummary: null,
            seq: 2,
          },
        ],
      }),
      window
    );
    expect(metrics.unhandledIntentCount).toBe(1);
    expect(metrics.unhandledIntents[0]).toMatchObject({
      sessionId: "empty",
      query: "Need help [link removed]",
    });
  });

  test("filters sessions whose backing or escalation tickets are excluded", () => {
    const metrics = computeAutonomyMetrics(
      input({
        sessions: [
          session({ id: "backing-excluded" }),
          session({
            id: "escalation-excluded",
            status: "escalated",
            backingTicketId: null,
            escalationTicketId: "ticket-2",
          }),
        ],
        tickets: [
          { id: "ticket-1", status: "Resolved", resolvedAt: null },
          { id: "ticket-2", status: "Resolved", resolvedAt: null },
        ],
        excludedTicketIds: new Set(["ticket-1", "ticket-2"]),
      }),
      window
    );
    expect(metrics.sessions).toBe(0);
  });
});
