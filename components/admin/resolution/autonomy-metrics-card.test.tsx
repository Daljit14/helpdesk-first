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
  escalated: 3,
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
};

afterEach(() => cleanup());

describe("AutonomyMetricsCard", () => {
  test("renders headline metrics, reasons, and unhandled intents", () => {
    render(<AutonomyMetricsCard metrics={metrics} />);
    expect(
      screen.getByText("Requester-agent outcome metrics")
    ).toBeInTheDocument();
    expect(screen.getByText("AI resolved")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("budget")).toBeInTheDocument();
    expect(screen.getByText("Cannot connect")).toBeInTheDocument();
    expect(screen.getByText("Median AI resolution: 2m")).toBeInTheDocument();
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
