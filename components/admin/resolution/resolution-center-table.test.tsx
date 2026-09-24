import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ResolutionCenterTable } from "./resolution-center-table";
import type {
  ResolutionMetrics,
  RunSummary,
} from "@/lib/admin/resolution-center";

const run: RunSummary = {
  id: "run-1",
  ticketId: "ticket-1",
  ticketTitle: "Cannot connect",
  ticketStatus: "AI Resolving",
  status: "executing",
  attempts: 1,
  maxAttempts: 3,
  costCents: 4,
  budgetCents: 20,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  completedAt: null,
  escalationReason: null,
  initiatedBy: "ai",
  elapsedMs: 5000,
  plannedCapability: "check_helpdesk_service_status",
  lastPolicyDecision: "allow_automatic",
  awaiting: null,
  reopened: false,
};

const metrics: ResolutionMetrics = {
  aiAssigned: 1,
  autoResolved: 0,
  userAssisted: 0,
  escalated: 0,
  verificationFailures: 0,
  rollbacks: 0,
  reopenRate: 0,
  falseResolutionRate: 0,
  medianTimeToVerifiedMs: 0,
  costPerVerifiedCents: 0,
  byCapability: [],
};

afterEach(() => {
  cleanup();
});

describe("ResolutionCenterTable", () => {
  test("renders an empty state", () => {
    render(<ResolutionCenterTable runs={[]} metrics={metrics} />);
    expect(screen.getByText("No AI-owned runs")).toBeInTheDocument();
  });

  test("renders run rows and ticket links", () => {
    render(<ResolutionCenterTable runs={[run]} metrics={metrics} />);
    expect(screen.getAllByText("Cannot connect").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Cannot connect" })[0]
    ).toHaveAttribute("href", "/admin/resolution/run-1");
    expect(
      screen.getAllByText("check_helpdesk_service_status").length
    ).toBeGreaterThan(0);
  });
});
