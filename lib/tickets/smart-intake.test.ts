import { afterEach, describe, expect, test, vi } from "vitest";
import {
  answersFromReply,
  clarifyCommentText,
  pickClarifyingQuestions,
  shouldClarify,
  SMART_INTAKE_MAX_QUESTIONS,
} from "./smart-intake";
import type { RouteDecision } from "./routing";

vi.mock("@/lib/org-environment/profile", () => ({
  loadConfirmedOrgEnvironment: vi.fn(async () => null),
  profileAnswers: vi.fn(() => []),
}));

const human = (reason: string): RouteDecision =>
  ({ resolver: "human", confidence: 0.3, riskLevel: "low", reason }) as never;

const base = {
  decision: human("low_confidence"),
  ai: { decision: "clarify" as const },
  safetyFlags: [] as string[],
  alreadyAsked: 0,
  organizationId: "org-1",
};

afterEach(() => vi.unstubAllEnvs());

describe("shouldClarify", () => {
  test("is off unless the flag is on", () => {
    expect(shouldClarify(base)).toBe(false);
  });

  test("clarifies low-confidence triage up to the question limit", () => {
    vi.stubEnv("HELP_DESK_SMART_INTAKE_ENABLED", "true");
    expect(shouldClarify(base)).toBe(true);
    expect(
      shouldClarify({ ...base, alreadyAsked: SMART_INTAKE_MAX_QUESTIONS })
    ).toBe(false);
    expect(shouldClarify({ ...base, organizationId: null })).toBe(false);
  });

  test("never delays safety, human requests or high-risk handoffs", () => {
    vi.stubEnv("HELP_DESK_SMART_INTAKE_ENABLED", "true");
    expect(shouldClarify({ ...base, safetyFlags: ["malware"] })).toBe(false);
    for (const reason of [
      "user_requested_human",
      "repeated_failure",
      "high_risk",
      "security_concern",
    ]) {
      expect(shouldClarify({ ...base, decision: human(reason) })).toBe(false);
    }
  });

  test("does not ask when the model already escalated for no guide", () => {
    vi.stubEnv("HELP_DESK_SMART_INTAKE_ENABLED", "true");
    expect(
      shouldClarify({
        ...base,
        ai: { decision: "escalate" },
        decision: human("no_approved_guide"),
      })
    ).toBe(false);
  });
});

describe("pickClarifyingQuestions", () => {
  test("prefers model questions, skips answered ones and caps at two", () => {
    const questions = pickClarifyingQuestions({
      proposedIds: ["which-platform", "network-owner", "already-restarted"],
      answeredIds: ["which-platform"],
      alreadyAsked: 0,
      categoryId: "network",
    });
    expect(questions.map((question) => question.id)).toEqual([
      "network-owner",
      "error-message",
    ]);
  });

  test("only fills the remaining slot after one question was asked", () => {
    expect(
      pickClarifyingQuestions({
        proposedIds: [],
        answeredIds: [],
        alreadyAsked: 1,
        categoryId: null,
      }).map((question) => question.id)
    ).toEqual(["error-message"]);
    expect(
      pickClarifyingQuestions({
        proposedIds: [],
        answeredIds: [],
        alreadyAsked: 2,
        categoryId: null,
      })
    ).toEqual([]);
  });
});

describe("reply helpers", () => {
  test("numbers questions and maps a reply to every pending question", () => {
    expect(
      clarifyCommentText([
        { id: "a", text: "First?" },
        { id: "b", text: "Second?" },
      ])
    ).toContain("1. First?\n2. Second?");
    expect(answersFromReply(["a", "b"], "  It says 0x80070005 ")).toEqual([
      { questionId: "a", answer: "It says 0x80070005" },
      { questionId: "b", answer: "It says 0x80070005" },
    ]);
  });
});
