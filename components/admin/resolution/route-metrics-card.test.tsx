import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { RouteMetricsCard } from "./route-metrics-card";
import type { RouteMetrics } from "@/lib/analytics/route-metrics";

afterEach(() => cleanup());

const metrics: RouteMetrics = {
  windowDays: 30,
  stats: {
    routedTickets: 4,
    reroutedTickets: 1,
    rerouteRate: 0.25,
    pingPongTicketIds: ["8f3c2a10-0000-4000-8000-000000000001"],
  },
  reviewCases: [
    {
      ticketId: "8f3c2a10-0000-4000-8000-000000000001",
      reroutes: 3,
      pingPong: true,
      category: "Network",
      platform: "Windows",
      handoffReason: "low_confidence",
      aiRecommendedIssueId: null,
      aiConfidence: 0.4,
    },
  ],
};

describe("RouteMetricsCard", () => {
  test("shows reroute rate, ping-pong count and review cases", () => {
    const { container } = render(<RouteMetricsCard metrics={metrics} />);
    expect(screen.getByText("Ticket routing")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("Ping-pong")).toBeInTheDocument();
    expect(screen.getByText("AI confidence too low")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "8f3c2a10" })).toHaveAttribute(
      "href",
      "/admin/tickets/8f3c2a10-0000-4000-8000-000000000001"
    );
    expect(container.querySelector(".overflow-x-auto")).toBeInTheDocument();
  });

  test("handles not-installed and empty states", () => {
    const { rerender } = render(<RouteMetricsCard metrics={null} />);
    expect(screen.getByText("Not installed")).toBeInTheDocument();
    rerender(
      <RouteMetricsCard
        metrics={{
          ...metrics,
          stats: { ...metrics.stats, routedTickets: 0 },
          reviewCases: [],
        }}
      />
    );
    expect(screen.getByText("No routing changes yet")).toBeInTheDocument();
  });
});
