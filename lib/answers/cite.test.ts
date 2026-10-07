import { describe, expect, test } from "vitest";
import { enforceCitations } from "./cite";
import type { AnswerSource } from "./types";

function source(
  id: string,
  tier: AnswerSource["tier"],
  domain: string
): AnswerSource {
  return {
    id,
    provider: tier === "reference" ? "wikipedia" : "brave",
    url: `https://${domain}/article`,
    domain,
    title: "Source",
    text: "Source text",
    tier,
    fetched: false,
    attribution: null,
  };
}

describe("answer citation enforcement", () => {
  test("drops missing and unknown citations, while keeping supported explanations", () => {
    const result = enforceCitations(
      {
        likelyCause: { text: "Unsupported cause.", sourceIds: ["missing"] },
        explanations: [
          { text: "This setting controls the app.", sourceIds: ["s1"] },
        ],
        steps: [{ text: "Restart the app.", sourceIds: ["missing"] }],
      },
      [source("s1", "vendor", "support.microsoft.com")]
    );
    expect(result.answer.likelyCause).toBeNull();
    expect(result.answer.explanations).toHaveLength(1);
    expect(result.answer.steps).toHaveLength(0);
    expect(result.droppedClaims).toBe(2);
  });

  test("drops reference-only fixes and causes but allows reference explanations", () => {
    const result = enforceCitations(
      {
        likelyCause: { text: "A possible cause.", sourceIds: ["wiki"] },
        explanations: [
          { text: "This explains the error.", sourceIds: ["wiki"] },
        ],
        steps: [{ text: "Run a repair script.", sourceIds: ["wiki"] }],
      },
      [source("wiki", "reference", "en.wikipedia.org")]
    );
    expect(result.answer.likelyCause).toBeNull();
    expect(result.answer.steps).toHaveLength(0);
    expect(result.answer.explanations).toHaveLength(1);
    expect(result.droppedClaims).toBe(2);
  });

  test("computes confidence from best tier and independent registrable domains", () => {
    const result = enforceCitations(
      {
        likelyCause: null,
        explanations: [],
        steps: [
          {
            text: "Open Settings and check the app.",
            sourceIds: ["vendor", "same-domain", "other-domain"],
          },
        ],
      },
      [
        source("vendor", "vendor", "support.microsoft.com"),
        source("same-domain", "vendor", "learn.microsoft.com"),
        source("other-domain", "qa_community", "superuser.com"),
      ]
    );
    expect(result.answer.steps[0]).toMatchObject({
      kind: "official",
      tiers: ["vendor", "qa_community"],
      independentDomains: 2,
      confidence: 0.9,
    });
    expect(result.answer.confidence).toBe(0.9);
    expect(result.answer.topTier).toBe("vendor");
  });

  test("returns text only after requester-safe redaction", () => {
    const result = enforceCitations(
      {
        likelyCause: null,
        explanations: [],
        steps: [
          { text: "Email alex@example.com for help.", sourceIds: ["s1"] },
        ],
      },
      [source("s1", "vendor", "support.microsoft.com")]
    );
    expect(result.answer.steps).toHaveLength(1);
    expect(result.answer.steps[0].text).not.toContain("alex@example.com");
    expect(result.droppedClaims).toBe(0);
  });
});
