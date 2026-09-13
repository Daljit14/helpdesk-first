import { describe, expect, test } from "vitest";
import { evaluateLearningEligibility } from "./learning-eligibility";

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
});
