import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AnswerEngineCard } from "./answer-engine-card";
import type { AnswerEngineMetrics } from "@/lib/analytics/answer-engine-metrics";

afterEach(() => cleanup());

const metrics: AnswerEngineMetrics = {
  windowDays: 30,
  runs: 2,
  answered: 1,
  answerRate: 0.5,
  cacheHits: 1,
  cacheHitRate: 0.5,
  p90LatencyMs: 1300,
  helpfulByTier: [{ tier: "vendor", feedback: 2, helpful: 1, rate: 0.5 }],
  topUnanswered: [{ label: "Cannot open Outlook", count: 2 }],
};

describe("AnswerEngineCard", () => {
  test("renders the off badge and current metrics without a new UI flow", () => {
    const { container } = render(
      <AnswerEngineCard metrics={metrics} enabled={false} />
    );
    expect(screen.getByText("Answer engine")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("Feedback by top tier")).toBeInTheDocument();
    expect(screen.getByText("Cannot open Outlook")).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
    expect(container.querySelector(".min-w-0")).toBeInTheDocument();
  });

  test("handles not-installed and empty states", () => {
    const { rerender } = render(
      <AnswerEngineCard metrics={null} enabled={true} />
    );
    expect(screen.getByText("Not installed")).toBeInTheDocument();
    rerender(
      <AnswerEngineCard metrics={{ ...metrics, runs: 0 }} enabled={true} />
    );
    expect(screen.getByText("No answer-engine runs yet")).toBeInTheDocument();
  });
});
