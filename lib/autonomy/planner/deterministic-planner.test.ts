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

function recentErrorsInput(
  data?: Record<string, number | null>,
  cause = "notification delivery failure"
): PlannerInput {
  return input({
    evidence: {
      ...evidence,
      hypotheses: [{ ...evidence.hypotheses[0], cause }],
      device: {
        deviceId: "device-1",
        platform: "linux",
        deviceClass: "managed",
        collectedAt: "2026-10-04T00:00:00.000Z",
        diagnostics: data
          ? [
              {
                kind: "recent_error_events",
                ok: true,
                summary: "Recent device errors.",
                data,
              },
            ]
          : [],
        stale: false,
      },
    },
    allowedCapabilities: caps(
      "device_recent_error_events",
      "search_approved_knowledge"
    ),
  });
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

  test.each([
    [
      "blocked camera",
      {
        kind: "camera_privacy" as const,
        ok: true,
        summary: "Camera access is blocked by privacy settings",
        data: { blocked: true, devicesPresent: 1 },
      },
    ],
    [
      "stale credentials",
      {
        kind: "credential_health" as const,
        ok: true,
        summary: "Expired sign-in tickets on the device — route to IT",
        data: { kerberosExpired: 1, stale: true },
      },
    ],
  ])("does not propose a device action for %s", async (_label, diagnostic) => {
    const result = await planner.plan(
      input({
        evidence: {
          ...evidence,
          device: {
            deviceId: "device-1",
            platform: "linux",
            deviceClass: "managed",
            collectedAt: "2026-10-04T00:00:00.000Z",
            diagnostics: [diagnostic],
            stale: false,
          },
        },
        allowedCapabilities: caps(
          "device_camera_privacy_status",
          "device_stale_credential_report",
          "search_approved_knowledge"
        ),
      })
    );
    expect(
      result.decision === "propose_action" &&
        result.capability.id.startsWith("device_")
    ).toBe(false);
  });

  test("escalates when recent error events include disk errors", async () => {
    const result = await planner.plan(
      recentErrorsInput({
        disk: 1,
        appCrash: 0,
        appHang: 0,
        signIn: 0,
        driver: 0,
      })
    );
    expect(result).toMatchObject({
      decision: "escalate",
      reason: "disk_errors_require_review",
    });
  });

  test("uses knowledge search for repeated crashes without a device action", async () => {
    const result = await planner.plan(
      recentErrorsInput(
        {
          disk: 0,
          appCrash: 3,
          appHang: 0,
          signIn: 0,
          driver: 0,
        },
        "Repeated app crashes in the last 24 hours"
      )
    );
    expect(result).toMatchObject({
      decision: "propose_action",
      capability: { id: "search_approved_knowledge" },
    });
    expect(
      result.decision === "propose_action" &&
        result.capability.id.startsWith("device_")
    ).toBe(false);
  });

  test("ignores non-disk recent errors when selecting a plan", async () => {
    const counts = {
      disk: 0,
      appCrash: 0,
      appHang: 0,
      signIn: 0,
      driver: 0,
      network: 0,
      other: 5,
    };
    const withRecentErrors = await planner.plan(recentErrorsInput(counts));
    const withoutRecentErrors = await planner.plan(recentErrorsInput());
    expect(withRecentErrors).toEqual(withoutRecentErrors);
  });

  test("escalates when no capability is allowed", async () => {
    const result = await planner.plan(input({ allowedCapabilities: [] }));
    expect(result).toMatchObject({
      decision: "escalate",
      reason: "no_applicable_capability",
    });
  });
});
