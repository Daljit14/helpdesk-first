import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminDashboard } from "./admin-dashboard";
import type { OperationsData } from "@/lib/admin/operations-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

function snapshot(withResolution = false): OperationsData {
  return {
    generatedAt: new Date().toISOString(),
    organizationId: "org-1",
    role: "admin",
    organizationName: "HelpDesk First",
    metrics: {
      activeUsers: 1,
      uniqueVisitorsToday: 2,
      pageViewsToday: 3,
      totalTickets: 4,
      openTickets: 5,
      newTickets: 6,
      inProgressTickets: 7,
      waitingTickets: 8,
      urgentOpenTickets: 9,
      completedToday: 10,
      totalCompleted: 11,
      slaBreached: 12,
      avgFirstResponseMinutes: 13,
      avgResolutionMinutes: 14,
      ticketsByCategory: [],
      ticketsByPlatform: [],
      agentWorkload: [],
    },
    resolution: withResolution
      ? {
          totalTickets: 4,
          openTickets: 1,
          aiAttempted: 2,
          aiSolved: 1,
          agentSolved: 1,
          selfServiceSolved: 0,
          escalated: 1,
          aiResolutionRate: 50,
          avgResolutionMinutes: 60,
          avgAiResolutionMinutes: 30,
          avgAgentResolutionMinutes: 90,
          daily: [],
        }
      : null,
    tickets: { rows: [], page: 1, pageSize: 25, total: 0 },
    filters: {
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-01-31T00:00:00.000Z",
      page: 1,
      pageSize: 25,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AdminDashboard", () => {
  test("refreshes on demand and keeps the old snapshot after failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
    render(<AdminDashboard initialSnapshot={snapshot()} />);
    expect(screen.getByText("Active users")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /refresh now/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  test("marks data stale after ten minutes", () => {
    vi.useFakeTimers();
    render(<AdminDashboard initialSnapshot={snapshot()} />);
    act(() => {
      vi.advanceTimersByTime(10 * 60_000 + 15_000);
    });
    expect(screen.getAllByText("STALE").length).toBeGreaterThan(0);
  });

  test("renders resolution metrics and empty activity state", () => {
    render(
      <AdminDashboard
        initialSnapshot={snapshot(true)}
        resolutionTrackingEnabled
      />
    );
    expect(screen.getByText("Resolution tracking")).toBeInTheDocument();
    expect(screen.getAllByText("Solved by AI").length).toBeGreaterThan(0);
    expect(screen.getByText("No resolution activity.")).toBeInTheDocument();
  });
});
