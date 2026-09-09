import { describe, expect, test } from "vitest";
import { ISSUES } from "@/lib/issues";
import { getIssueBySlug } from "@/lib/search";
import {
  buildEscalationPackage,
  summarizeEscalationPackage,
  type EscalationInputs,
} from "./escalation";

function inputs(overrides: Partial<EscalationInputs> = {}): EscalationInputs {
  return {
    ticket: {
      id: "ticket-1",
      user_id: "user-1",
      message: "Computer freezes after opening several apps.",
      issue_id: "computer-freezing",
      issue_title: "Computer freezing",
      category: "computer",
      priority: "High",
      platform: "Windows",
      diagnostic_answers: [
        { questionId: "which-platform", answer: "Windows" },
        { questionId: "unknown-question", answer: "Sometimes" },
      ],
      handoff_reason: "Repeated failure",
      escalation_reason: "The requester needs support.",
      needs_human_at: "2026-01-01T00:00:00.000Z",
      escalated_at: null,
      ai_failed_attempts: 2,
      ai_confidence: 0.4,
    },
    investigation: {
      ticket_id: "ticket-1",
      organization_id: "org-1",
      user_id: "user-1",
      context: { os: "Windows", device: "Laptop" },
      hypotheses: [
        {
          cause: "A frozen application",
          confidence: 0.9,
          evidence: ["Apps stop responding"],
          guideSlug: "computer-freezing",
        },
        {
          cause: "Low available memory",
          confidence: 0.6,
          evidence: ["The fan is loud"],
        },
      ],
      excluded_steps: [],
      withheld_steps: [
        { guideSlug: "computer-freezing", stepIndex: 1, risk: "approval" },
      ],
      status: "escalated",
      escalation_package: null,
      escalation_package_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    turns: [
      {
        id: 1,
        ticket_id: "ticket-1",
        organization_id: "org-1",
        decision: "escalate",
        confidence: 0.85,
        matched_issue_slug: "computer-freezing",
        question_ids: ["which-platform"],
        hypotheses: [],
        next_steps: [],
        withheld_steps: [
          { guideSlug: "computer-freezing", stepIndex: 1, risk: "approval" },
        ],
        provider: "anthropic",
        model: "model-name",
        created_at: "2026-01-01T00:01:00.000Z",
      },
    ],
    stepOutcomes: [
      {
        guide_slug: "computer-freezing",
        step_index: 0,
        outcome: "failed",
        created_at: "2026-01-01T00:02:00.000Z",
      },
    ],
    actions: [
      {
        tool_name: "restart-check",
        action_summary: "Checked whether the device restarted.",
        result_summary: "The issue remained.",
        created_at: "2026-01-01T00:03:00.000Z",
      },
    ],
    requesterRole: "requester",
    attachmentCount: 1,
    ...overrides,
  };
}

describe("buildEscalationPackage", () => {
  test("builds a bounded diagnosis from investigation data", () => {
    const pkg = buildEscalationPackage(
      inputs(),
      new Date("2026-01-02T00:00:00.000Z")
    );

    expect(pkg.likelyRootCause?.cause).toBe("A frozen application");
    expect(pkg.otherHypotheses).toHaveLength(1);
    expect(pkg.stepsAttempted[0]).toMatchObject({
      text: expect.any(String),
      risk: expect.any(String),
      outcome: "failed",
    });
    expect(pkg.questionsAndAnswers).toEqual([
      expect.objectContaining({
        questionId: "which-platform",
        question: expect.stringContaining("Which device"),
        answer: "Windows",
      }),
      expect.objectContaining({
        questionId: "unknown-question",
        question: null,
      }),
    ]);
    expect(pkg.withheldSteps[0]).toMatchObject({
      risk: "approval",
    });
    expect(pkg.sources[0]).toMatchObject({
      guideSlug: "computer-freezing",
      title: getIssueBySlug("computer-freezing")?.title,
    });
  });

  test("truncates strings, caps arrays, and has deterministic JSON-safe keys", () => {
    const long = "x".repeat(2000);
    const base = inputs({
      ticket: {
        ...inputs().ticket,
        message: long,
        diagnostic_answers: Array.from({ length: 20 }, (_, index) => ({
          questionId: `question-${index}`,
          answer: long,
        })),
      },
      investigation: {
        ...inputs().investigation!,
        hypotheses: Array.from({ length: 30 }, (_, index) => ({
          cause: `${index}-${long}`,
          confidence: 1 - index / 100,
          evidence: [`${index}-${long}`],
        })),
      },
      stepOutcomes: Array.from({ length: 60 }, (_, index) => ({
        guide_slug: "computer-freezing",
        step_index: index % 5,
        outcome: "worked" as const,
        created_at: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
      })),
    });
    const pkg = buildEscalationPackage(base);

    expect(pkg.problem.message).toHaveLength(2000);
    expect(pkg.questionsAndAnswers).toHaveLength(10);
    expect(pkg.stepsAttempted).toHaveLength(40);
    expect(pkg.symptoms).toHaveLength(20);
    expect(Object.keys(pkg).sort()).toEqual([
      "aiConfidence",
      "context",
      "generatedAt",
      "handoff",
      "likelyRootCause",
      "otherHypotheses",
      "problem",
      "questionsAndAnswers",
      "sources",
      "stepsAttempted",
      "symptoms",
      "testsPerformed",
      "turns",
      "version",
      "withheldSteps",
    ]);
    expect(JSON.parse(JSON.stringify(pkg))).toEqual(pkg);
  });

  test("returns empty sections for an empty investigation", () => {
    const pkg = buildEscalationPackage(
      inputs({
        ticket: {
          ...inputs().ticket,
          diagnostic_answers: [],
        },
        investigation: null,
        turns: [],
        stepOutcomes: [],
        actions: [],
        requesterRole: null,
        attachmentCount: 0,
      })
    );

    expect(pkg.likelyRootCause).toBeNull();
    expect(pkg.symptoms).toEqual([]);
    expect(pkg.questionsAndAnswers).toEqual([]);
    expect(pkg.stepsAttempted).toEqual([]);
    expect(pkg.withheldSteps).toEqual([]);
    expect(pkg.testsPerformed).toEqual([]);
  });

  test("summarizes the root cause and handoff counts within 600 characters", () => {
    const summary = summarizeEscalationPackage(
      buildEscalationPackage(inputs())
    );

    expect(summary.length).toBeLessThanOrEqual(600);
    expect(summary).toContain("A frozen application");
    expect(summary).toContain("1 steps tried");
    expect(summary).toContain("Repeated failure");
  });

  test("does not throw for an empty-investigation ticket across the catalog", () => {
    for (const issue of ISSUES) {
      expect(() =>
        buildEscalationPackage(
          inputs({
            ticket: {
              ...inputs().ticket,
              issue_id: issue.id,
              issue_title: issue.title,
            },
            investigation: null,
            turns: [],
            stepOutcomes: [],
            actions: [],
          })
        )
      ).not.toThrow();
    }
  });
});
