import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AutonomyMetricsCard } from "./autonomy-metrics-card";
import type { AutonomyMetrics } from "@/lib/analytics/autonomy-metrics";

const metrics: AutonomyMetrics = {
  window: {
    windowDays: 30,
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-31T23:59:59.999Z",
  },
  sessions: 10,
  aiResolved: 6,
  aiResolutionRate: 0.6,
  falseResolved: 1,
  falseResolvedRate: 1 / 6,
  outcomeFeedback: 0,
  recentFeedback: [],
  escalated: 3,
  replyRedactedSessions: 2,
  escalationRate: 0.3,
  escalationReasons: [{ reason: "budget", count: 2 }],
  medianAiResolutionMs: 120_000,
  medianHumanResolutionMs: 240_000,
  unhandledIntents: [
    {
      sessionId: "session-1",
      startedAt: "2026-01-02T00:00:00.000Z",
      query: "Cannot connect",
    },
  ],
  unhandledIntentCount: 1,
  costTracking: false,
  totalCostMicros: 0,
  costPerAiResolutionMicros: null,
  orgEnvironment: false,
  clarifiedTickets: 0,
  avgClarifyingQuestions: null,
  v2: {
    version: 2,
    sessions: 10,
    outcomes: {
      ai_resolved: 6,
      pending: 1,
      false_resolved: 1,
      staff_touched: 1,
      unverified: 0,
      abandoned: 1,
      escalated: 0,
    },
    aiResolved: 6,
    aiResolutionRate: 0.6,
    falseResolved: 1,
    falseResolvedRate: 1 / 7,
    deflected: 7,
    deflectionRate: 0.7,
    abandoned: 1,
    abandonmentRate: 0.1,
    medianResolveMs: 120_000,
    p90ResolveMs: 240_000,
    pending: 1,
    hiddenStaffTouch: 1,
    repeatIssues: 2,
    repeatIssueRate: 1 / 3,
    sessionOutcomes: [],
    byCategory: [
      {
        key: "network",
        sessions: 6,
        aiResolved: 4,
        falseResolved: 1,
        staffTouched: 0,
        abandoned: 1,
        escalated: 0,
        aiResolutionRate: 4 / 6,
        falseResolvedRate: 1 / 5,
      },
    ],
    byCapability: [
      {
        key: "device_flush_dns",
        sessions: 3,
        aiResolved: 2,
        falseResolved: 1,
        staffTouched: 0,
        abandoned: 0,
        escalated: 0,
        aiResolutionRate: 2 / 3,
        falseResolvedRate: 1 / 3,
      },
    ],
  },
};

afterEach(() => cleanup());

describe("AutonomyMetricsCard", () => {
  test("renders headline metrics, reasons, and unhandled intents", () => {
    render(<AutonomyMetricsCard metrics={metrics} />);
    expect(
      screen.getByText("Requester-agent outcome metrics")
    ).toBeInTheDocument();
    expect(screen.getAllByText("AI resolved")).toHaveLength(3);
    expect(screen.getAllByText("60%")).toHaveLength(1);
    expect(screen.getByText("budget")).toBeInTheDocument();
    expect(screen.getByText("Replies redacted:")).toBeInTheDocument();
    expect(screen.getByText("2 sessions")).toBeInTheDocument();
    expect(screen.getByText("Cannot connect")).toBeInTheDocument();
    expect(screen.getByText("Median time to resolve")).toBeInTheDocument();
    expect(screen.getByText("p90 time to resolve")).toBeInTheDocument();
    expect(screen.queryByText("AI spend (window)")).not.toBeInTheDocument();
  });

  test("renders all three v2 metric pairs, supporting tiles, and breakdowns", () => {
    render(<AutonomyMetricsCard metrics={metrics} />);

    expect(screen.getByText("Last 30 days · Metrics v2")).toBeInTheDocument();
    expect(screen.getAllByText("AI resolved")).toHaveLength(3);
    expect(screen.getAllByText("False resolved")).toHaveLength(3);
    expect(screen.getByText("Deflection")).toBeInTheDocument();
    expect(screen.getByText("Abandonment")).toBeInTheDocument();
    expect(screen.getByText("Median time to resolve")).toBeInTheDocument();
    expect(screen.getByText("p90 time to resolve")).toBeInTheDocument();
    expect(screen.getByText("Pending (72 h)")).toBeInTheDocument();
    expect(screen.getByText("Hidden staff touch")).toBeInTheDocument();
    expect(screen.getByText("Repeat-issue rate (30 d)")).toBeInTheDocument();
    expect(
      screen.getByText("Metrics v1 (comparison): AI resolution rate 60%")
    ).toBeInTheDocument();
    expect(screen.getByText("By category")).toBeInTheDocument();
    expect(screen.getByText("By capability")).toBeInTheDocument();
  });

  test("renders cost tiles only when cost tracking is enabled", () => {
    render(
      <AutonomyMetricsCard
        metrics={{
          ...metrics,
          costTracking: true,
          totalCostMicros: 1_230_000,
          costPerAiResolutionMicros: 12_300,
        }}
      />
    );

    expect(screen.getByText("Cost per AI resolution")).toBeInTheDocument();
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    expect(screen.getByText("AI spend (window)")).toBeInTheDocument();
    expect(screen.getByText("$1.23")).toBeInTheDocument();
  });

  test("renders average clarifying questions only when organization profile is enabled", () => {
    const { rerender } = render(<AutonomyMetricsCard metrics={metrics} />);
    expect(
      screen.queryByText("Avg clarifying questions")
    ).not.toBeInTheDocument();

    rerender(
      <AutonomyMetricsCard
        metrics={{
          ...metrics,
          orgEnvironment: true,
          clarifiedTickets: 4,
          avgClarifyingQuestions: 2.25,
        }}
      />
    );
    expect(screen.getByText("Avg clarifying questions")).toBeInTheDocument();
    expect(screen.getByText("2.3")).toBeInTheDocument();
    expect(screen.getByText("4 tickets")).toBeInTheDocument();
  });

  test("shows a dash and ticket count when no clarification turns exist", () => {
    render(
      <AutonomyMetricsCard
        metrics={{
          ...metrics,
          orgEnvironment: true,
          sessions: 0,
          clarifiedTickets: 0,
          avgClarifyingQuestions: null,
        }}
      />
    );
    expect(screen.getByText("Avg clarifying questions")).toBeInTheDocument();
    expect(screen.getByText("0 tickets")).toBeInTheDocument();
  });

  test("shows a dash when cost tracking is enabled without AI resolutions", () => {
    render(
      <AutonomyMetricsCard
        metrics={{
          ...metrics,
          costTracking: true,
          costPerAiResolutionMicros: null,
        }}
      />
    );

    expect(screen.getByText("Cost per AI resolution")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  test("renders the empty state when there are no sessions", () => {
    render(
      <AutonomyMetricsCard
        metrics={{ ...metrics, sessions: 0, unhandledIntents: [] }}
      />
    );
    expect(
      screen.getByText(
        "Outcome metrics will appear here after requester-agent sessions are recorded for this organization."
      )
    ).toBeInTheDocument();
  });
});
