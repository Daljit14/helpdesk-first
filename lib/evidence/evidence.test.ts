import { describe, expect, test } from "vitest";
import type { Hypothesis } from "@/lib/ai/types";
import { buildEvidence } from "./build";
import { adjustConfidence } from "./confidence";
import { deriveFacts } from "./facts";
import { buildHypotheses } from "./hypotheses";
import { filterUnaskedQuestions, mergeAskedQuestionIds } from "./questions";
import { redactEvidenceText } from "./redaction";
import { neutraliseCertainty } from "./wording";

describe("evidence primitives", () => {
  test("adjusts confidence with bounded support and rejection", () => {
    const rejecting = [
      {
        id: "g#0",
        kind: "step_outcome" as const,
        summary: "failed",
        result: "rejects" as const,
      },
    ];
    const supporting = [
      {
        id: "g#1",
        kind: "step_outcome" as const,
        summary: "worked",
        result: "supports" as const,
      },
      {
        id: "g#2",
        kind: "step_outcome" as const,
        summary: "worked",
        result: "supports" as const,
      },
      {
        id: "g#3",
        kind: "step_outcome" as const,
        summary: "worked",
        result: "supports" as const,
      },
    ];
    expect(adjustConfidence(0.8, supporting, rejecting)).toMatchObject({
      confidence: 0.6,
    });
    expect(adjustConfidence(0.01, [], []).confidence).toBe(0.05);
    expect(adjustConfidence(0.99, [], []).confidence).toBe(0.95);
    expect(adjustConfidence(0.8, [], rejecting).explanation).toMatch(/^Likely/);
  });

  test("neutralises certainty wording and is idempotent", () => {
    const wording = neutraliseCertainty(
      "Confirmed: root cause is DNS, definitely."
    );
    expect(wording).not.toMatch(/confirmed|root cause is|definitely/i);
    expect(neutraliseCertainty(wording)).toBe(wording);
  });

  test("filters and merges question ids stably", () => {
    expect(filterUnaskedQuestions(["a", "b", "c"], ["a"])).toEqual(["b", "c"]);
    expect(mergeAskedQuestionIds(["a", "b"], ["b", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("derives facts and excludes unclean attachments", () => {
    const facts = deriveFacts({
      platform: "Mac",
      qa: [
        { questionId: "network-owner", answer: "My work manages it" },
        { questionId: "already-restarted", answer: "Yes, already" },
        { questionId: "error-message", answer: "No such file" },
      ],
      stepOutcomes: [
        {
          guide_slug: "slow-computer",
          step_index: 1,
          outcome: "failed",
          created_at: "2026-01-01",
        },
      ],
      attachments: [
        {
          id: "clean",
          declared_mime: "image/png",
          status: "ready",
          scan_verdict: "clean",
          page_count: null,
          width: 10,
          height: 20,
        },
        {
          id: "pending",
          declared_mime: "application/pdf",
          status: "scanning",
          scan_verdict: "unscanned",
          page_count: null,
          width: null,
          height: null,
        },
      ],
    });
    expect(facts.deviceOwnership).toBe("organization");
    expect(facts.confirmedFacts.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "platform:Mac",
        "restart_attempted",
        "error_message_reported",
      ])
    );
    expect(facts.tests[0]?.result).toBe("rejects");
    expect(facts.attachmentFindings).toHaveLength(1);
    expect(facts.unknownFacts).toContain(
      "1 attachment(s) not yet scanned clean"
    );
  });

  test("attaches tests to hypotheses and sorts by adjusted confidence", () => {
    const hypotheses: Hypothesis[] = [
      { cause: "Low", confidence: 0.4, evidence: [], guideSlug: "low" },
      {
        cause: "Confirmed high",
        confidence: 0.8,
        evidence: [],
        guideSlug: "high",
      },
    ];
    const result = buildHypotheses(hypotheses, [
      {
        id: "high#1",
        kind: "step_outcome",
        summary: "failed",
        result: "rejects",
      },
    ]);
    expect(result[0]?.guideSlug).toBe("high");
    expect(result[0]?.cause).not.toMatch(/confirmed/i);
    expect(buildHypotheses([], [])).toEqual([]);
  });

  test("builds redacted evidence with approved citations and warnings", () => {
    const record = buildEvidence({
      ticket: {
        message: "My password is hunter2 and email me at person@example.com",
        platform: "Mac",
        issue_id: "slow-computer",
        diagnostic_answers: [
          { questionId: "error-message", answer: "password is hunter2" },
        ],
      },
      investigation: null,
      turns: [
        {
          id: 1,
          ticket_id: "ticket",
          organization_id: "org",
          decision: "match",
          confidence: 0.8,
          matched_issue_slug: "slow-computer",
          question_ids: [],
          hypotheses: [
            {
              cause: "Likely computer issue",
              confidence: 0.8,
              evidence: [],
              guideSlug: "slow-computer",
            },
          ],
          next_steps: [],
          withheld_steps: [],
          provider: "mock",
          model: null,
          created_at: "2026-01-01",
        },
      ],
      stepOutcomes: [],
      attachments: [],
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(record.description).not.toContain("hunter2");
    expect(JSON.stringify(record)).not.toContain("person@example.com");
    expect(record.redaction.credential).toBeGreaterThan(0);
    expect(record.citations).toEqual([
      expect.objectContaining({ guideSlug: "slow-computer" }),
    ]);
    expect(record.safetyWarnings.join(" ")).toMatch(
      /Sensitive topic|Credential/
    );
    expect(record.generatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  test("redacts text through the learning redaction implementation", () => {
    const result = redactEvidenceText("Email person@example.com");
    expect(result.text).not.toContain("person@example.com");
    expect(result.summary.email).toBe(1);
  });
});
