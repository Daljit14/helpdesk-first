import { describe, expect, test } from "vitest";
import { ISSUES } from "@/lib/issues";
import {
  findSimilarGuides,
  validateLearnedArticle,
  type LearnedArticle,
} from "./learning-article";

function article(overrides: Partial<LearnedArticle> = {}): LearnedArticle {
  return {
    title: "Wi-Fi troubleshooting",
    problemSummary: "The wireless connection drops.",
    symptoms: ["Wi-Fi drops every few minutes"],
    platforms: ["Windows"],
    rootCause: "The adapter was disabled.",
    preconditions: [],
    steps: [{ text: "Restart the computer.", risk: "safe" }],
    verification: ["Ask the user to reconnect."],
    escalationConditions: ["The symptom returns."],
    prevention: ["Keep the device updated."],
    sources: [{ type: "guide", reference: "wifi-disconnecting" }],
    confidence: 0.8,
    securityReviewRequired: false,
    ...overrides,
  };
}

describe("validateLearnedArticle", () => {
  test.each([
    [
      "missing fields",
      (() => {
        const value = article() as unknown as Record<string, unknown>;
        delete value.steps;
        return value;
      })(),
    ],
    ["extra keys", { ...article(), unexpected: true }],
    [
      "more than 12 steps",
      {
        ...article(),
        steps: Array.from({ length: 13 }, (_, index) => ({
          text: `Step ${index + 1}`,
          risk: "safe" as const,
        })),
      },
    ],
  ])("%s returns ok false", (_label, value) => {
    expect(validateLearnedArticle(value, ["wifi-disconnecting"]).ok).toBe(
      false
    );
  });

  test.each([
    ["shell command", "Run ipconfig /flushdns."],
    ["password bypass", "Bypass the password lock."],
    ["registry", "Open regedit and change the registry."],
    ["BIOS", "Flash the BIOS."],
    ["disable antivirus", "Disable antivirus protection."],
    ["TeamViewer", "Use TeamViewer to control the user's computer."],
    ["factory reset", "Perform a factory reset and erase all data."],
  ])("unsafe %s steps are rejected", (_label, text) => {
    const result = validateLearnedArticle(
      article({ steps: [{ text, risk: "safe" }] }),
      ["wifi-disconnecting"]
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("steps.0");
  });

  test("model-supplied risk is overwritten by the policy engine", () => {
    const result = validateLearnedArticle(
      article({
        steps: [{ text: "Check for driver updates.", risk: "safe" }],
      }),
      ["wifi-disconnecting"]
    );
    expect(result.ok).toBe(true);
    expect(result.article?.steps[0].risk).toBe("caution");
  });

  test("approval and specialist steps set securityReviewRequired", () => {
    const approval = validateLearnedArticle(
      article({
        steps: [{ text: "Check the DNS settings.", risk: "safe" }],
      }),
      ["wifi-disconnecting"]
    );
    expect(approval.ok).toBe(true);
    expect(approval.securityReviewRequired).toBe(true);
    expect(approval.article?.steps[0].risk).toBe("approval");

    const specialist = validateLearnedArticle(
      article({
        steps: [{ text: "Remove malware from the device.", risk: "safe" }],
      }),
      ["wifi-disconnecting"]
    );
    expect(specialist.ok).toBe(true);
    expect(specialist.securityReviewRequired).toBe(true);
    expect(specialist.article?.steps[0].risk).toBe("specialist");
  });

  test("unapproved URL source and unknown guide slug source are rejected", () => {
    expect(
      validateLearnedArticle(
        article({
          sources: [{ type: "url", reference: "https://example.com/guide" }],
        }),
        ["wifi-disconnecting"]
      ).ok
    ).toBe(false);
    expect(
      validateLearnedArticle(
        article({
          sources: [{ type: "guide", reference: "unknown-guide" }],
        }),
        ["wifi-disconnecting"]
      ).ok
    ).toBe(false);
  });
});

describe("findSimilarGuides", () => {
  test("finds the matching catalog guide for a wifi-disconnect article", () => {
    const matches = findSimilarGuides(article(), ISSUES);
    expect(matches[0]?.slug).toBe("wifi-disconnecting");
  });

  test("returns [] for an unrelated article", () => {
    expect(
      findSimilarGuides(
        article({
          title: "Quantum telescope alignment",
          symptoms: ["Astrophysics observations fail"],
          rootCause: "The observatory requires calibration.",
          platforms: ["Other"],
          sources: [],
        }),
        ISSUES
      )
    ).toEqual([]);
  });
});
