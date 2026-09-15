import { describe, expect, test } from "vitest";
import { DeterministicPlanner } from "./deterministic-planner";
import type { PlannerInput } from "./types";

const evidence = {
  version: 1 as const,
  generatedAt: "2026-01-01T00:00:00.000Z",
  description: "Email notification was not received.",
  redaction: {},
  context: {
    platform: null,
    os: null,
    device: null,
    app: null,
    deviceOwnership: "unknown" as const,
  },
  attachmentFindings: [],
  qa: [],
  confirmedFacts: [],
  unknownFacts: [],
  hypotheses: [
    {
      id: "h1",
      cause: "notification delivery failure",
      guideSlug: null,
      rawConfidence: 0.9,
      confidence: 0.9,
      explanation: "The outbox may have failed.",
      supporting: [],
      rejecting: [],
    },
  ],
  citations: [],
  safetyWarnings: [],
  missingInformation: [],
};

const caps = (...ids: string[]) =>
  ids.map((id) => ({
    id,
    version: 1,
    description: id,
    inputSchemaJson: {},
  }));

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    evidence,
    ticket: {
      id: "00000000-0000-4000-8000-000000000001",
      category: null,
      platform: null,
    },
    allowedCapabilities: caps(
      "retry_failed_notification",
      "check_helpdesk_service_status",
      "ask_diagnostic_question",
      "search_approved_knowledge",
      "escalate_with_evidence"
    ),
    priorAttempts: [],
    ...overrides,
  };
}

describe("deterministic planner", () => {
  const planner = new DeterministicPlanner();

  test("selects retry for notification failures with an id", async () => {
    const result = await planner.plan({
      ...input(),
      ticket: {
        ...input().ticket,
        context: {
          failedNotificationId: "00000000-0000-4000-8000-000000000002",
        },
      },
    });
    expect(result).toMatchObject({
      capability: { id: "retry_failed_notification" },
    });
  });

  test("selects service status without a failed notification id", async () => {
    const result = await planner.plan(input());
    expect(result).toMatchObject({
      capability: { id: "check_helpdesk_service_status" },
    });
  });

  test("selects a diagnostic question for missing information", async () => {
    const result = await planner.plan(
      input({
        evidence: {
          ...evidence,
          description: "The laptop has an intermittent issue.",
          hypotheses: [{ ...evidence.hypotheses[0], cause: "unknown issue" }],
          missingInformation: ["platform"],
        },
      })
    );
    expect(result).toMatchObject({
      capability: { id: "ask_diagnostic_question" },
    });
  });

  test("selects knowledge search for a grounded hypothesis", async () => {
    const result = await planner.plan(
      input({
        evidence: {
          ...evidence,
          description: "The display is blank.",
          hypotheses: [{ ...evidence.hypotheses[0], cause: "display issue" }],
        },
      })
    );
    expect(result).toMatchObject({
      capability: { id: "search_approved_knowledge" },
    });
  });

  test("does not repeat failed capabilities", async () => {
    const result = await planner.plan(
      input({
        priorAttempts: [
          {
            capabilityId: "check_helpdesk_service_status",
            version: 1,
            status: "failed",
          },
        ],
      })
    );
    expect(result).not.toMatchObject({
      capability: { id: "check_helpdesk_service_status" },
    });
  });

  test("escalates when no capability is allowed", async () => {
    const result = await planner.plan(input({ allowedCapabilities: [] }));
    expect(result).toMatchObject({
      decision: "escalate",
      reason: "no_applicable_capability",
    });
  });
});
