import { describe, expect, test } from "vitest";
import {
  evaluateAgentSessionEligibility,
  evaluateLearningEligibility,
} from "./learning-eligibility";

const report = {
  rootCause: "The adapter was disabled.",
  actionsPerformed: "Enabled the adapter.",
  toolsUsed: "Network settings",
  preventiveRecommendation: "Check the connection icon.",
};

function eligibleInput(overrides: Record<string, unknown> = {}) {
  return {
    status: "Resolved",
    reopenCount: 0,
    verificationMethod: "user_confirmed",
    verificationException: false,
    verifiedByUser: true,
    resolutionReport: report,
    textForScreening: ["Web pages will not load", report.rootCause],
    ...overrides,
  };
}

describe("evaluateLearningEligibility", () => {
  test("only Resolved + user-confirmed + complete report is eligible", () => {
    expect(evaluateLearningEligibility(eligibleInput())).toEqual({
      eligible: true,
    });
  });

  test("reopened (reopen_count>0) is not eligible", () => {
    expect(
      evaluateLearningEligibility(eligibleInput({ reopenCount: 1 }))
    ).toMatchObject({ eligible: false, reason: "reopened" });
  });

  test("verification_exception is not eligible with manualReview true", () => {
    expect(
      evaluateLearningEligibility(
        eligibleInput({ verificationException: true })
      )
    ).toMatchObject({
      eligible: false,
      reason: "verification_exception",
      manualReview: true,
    });
  });

  test("missing root cause is not eligible", () => {
    expect(
      evaluateLearningEligibility(
        eligibleInput({
          resolutionReport: { ...report, rootCause: "" },
        })
      )
    ).toMatchObject({ eligible: false, reason: "incomplete_report" });
  });

  test("missing verification method is not eligible", () => {
    expect(
      evaluateLearningEligibility(eligibleInput({ verificationMethod: null }))
    ).toMatchObject({ eligible: false, reason: "not_user_confirmed" });
  });

  test.each([
    ["password/MFA", "The MFA prompt is not working."],
    ["recovery key", "The BitLocker recovery key is unavailable."],
    ["compromise", "The account may be compromised after a phishing message."],
    ["malware", "The device may have malware."],
    ["student-sensitive", "The student record needs correction."],
    ["invasive recovery", "We need data recovery for deleted files."],
    ["BIOS/firmware", "The BIOS firmware needs an update."],
  ])("%s is not eligible with manualReview true", (_label, text) => {
    expect(
      evaluateLearningEligibility(eligibleInput({ textForScreening: [text] }))
    ).toMatchObject({
      eligible: false,
      reason: "sensitive_topic",
      manualReview: true,
    });
  });

  test("credentials in text are not eligible with manualReview true", () => {
    expect(
      evaluateLearningEligibility(
        eligibleInput({ textForScreening: ["password: hunter2"] })
      )
    ).toMatchObject({
      eligible: false,
      reason: "credentials_present",
      manualReview: true,
    });
  });

  test("staff one-off close-out is not promoted or sent to manual review", () => {
    expect(
      evaluateLearningEligibility(
        eligibleInput({
          resolutionReport: { ...report, reuse: "one_off" },
        })
      )
    ).toEqual({
      eligible: false,
      reason: "staff_one_off",
      manualReview: false,
    });
  });
});

describe("evaluateAgentSessionEligibility", () => {
  const valid = {
    status: "resolved",
    userConfirmedAt: "2026-01-01T00:00:00Z",
    latestVerificationOutcome: "passed",
    securityFlag: false,
    tainted: false,
    backingTicketReopenCount: 0,
  };

  test("requires resolved and requester-confirmed session", () => {
    expect(
      evaluateAgentSessionEligibility({
        ...valid,
        status: "active",
        userConfirmedAt: null,
      })
    ).toMatchObject({
      eligible: false,
      reason: "session_not_confirmed",
      manualReview: false,
    });
  });

  test("requires the latest stored verification to pass", () => {
    expect(
      evaluateAgentSessionEligibility({
        ...valid,
        latestVerificationOutcome: "failed",
      })
    ).toMatchObject({
      eligible: false,
      reason: "verification_not_passed",
      manualReview: false,
    });
  });

  test("rejects security-flagged sessions", () => {
    expect(
      evaluateAgentSessionEligibility({ ...valid, securityFlag: true })
    ).toMatchObject({
      eligible: false,
      reason: "security_flagged",
      manualReview: false,
    });
  });

  test("rejects tainted sessions", () => {
    expect(
      evaluateAgentSessionEligibility({ ...valid, tainted: true })
    ).toMatchObject({
      eligible: false,
      reason: "tainted_session",
      manualReview: false,
    });
  });

  test("still rejects reopened backing tickets", () => {
    expect(
      evaluateAgentSessionEligibility({
        ...valid,
        backingTicketReopenCount: 1,
      })
    ).toMatchObject({ eligible: false, reason: "reopened" });
  });

  test("rejects agent sessions when backing-ticket reopen count is unknown", () => {
    expect(
      evaluateAgentSessionEligibility({
        status: "resolved",
        userConfirmedAt: "2026-01-01T00:00:00.000Z",
        latestVerificationOutcome: "passed",
        securityFlag: false,
        tainted: false,
        backingTicketReopenCount: null,
      })
    ).toMatchObject({ eligible: false, reason: "reopened" });
  });
});
