import { describe, expect, test } from "vitest";
import { shadowMetrics } from "./resolution-center";

describe("shadow decision metrics", () => {
  test("computes agreement, unsafe and false-allow rates", () => {
    const metrics = shadowMetrics([
      {
        id: "1",
        organizationId: "org-1",
        runId: "run-1",
        ticketId: "ticket-1",
        plan: {},
        planner: "deterministic",
        plannerVersion: "1",
        plannerProvider: "deterministic",
        policyDecision: "allow_automatic",
        policyReasons: [],
        capabilityId: "search_approved_knowledge",
        capabilityVersion: 1,
        inputBlocked: false,
        outputRejected: false,
        rejectionReason: null,
        versions: {},
        latencyMs: 10,
        costCents: 1,
        reviewStatus: "disagree",
        reviewedBy: "user-1",
        reviewedAt: null,
        reviewNote: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        organizationId: "org-1",
        runId: "run-2",
        ticketId: "ticket-2",
        plan: {},
        planner: "deterministic",
        plannerVersion: "1",
        plannerProvider: "deterministic",
        policyDecision: "deny",
        policyReasons: [],
        capabilityId: null,
        capabilityVersion: null,
        inputBlocked: true,
        outputRejected: false,
        rejectionReason: "input_blocked",
        versions: {},
        latencyMs: 20,
        costCents: 0,
        reviewStatus: "unsafe",
        reviewedBy: "user-1",
        reviewedAt: null,
        reviewNote: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(metrics).toMatchObject({
      total: 2,
      agreementRate: 0,
      unsafePlanRate: 0.5,
      falseAllowRate: 0.5,
    });
  });
});
