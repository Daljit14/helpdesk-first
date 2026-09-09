import { describe, expect, test } from "vitest";
import { createAiProvider } from "./mock-provider";
import { diagnosticQuestions } from "./types";
import { ISSUES } from "@/lib/issues";
import { getAllIssueSlugs } from "@/lib/search";

const provider = createAiProvider();
const approvedSlugs = ISSUES.map((issue) => issue.id);
const approvedOutputSlugs = getAllIssueSlugs();

describe("MockAiProvider", () => {
  test.each(approvedSlugs)(
    "matches the approved issue with slug '%s' when described plainly",
    async (id) => {
      const result = await provider.classify({
        message: id.replace(/-/g, " ") + " on windows",
        platform: "Windows",
      });
      expect(result.decision).not.toBe("escalate");
      expect(result.matchedIssueSlug).toBe(id);
      expect(result.explanation).toMatch(/issue|guide|troubleshoot/i);
      if (result.decision === "match") {
        expect(result.hypotheses?.length).toBeGreaterThanOrEqual(1);
        expect(result.hypotheses?.length).toBeLessThanOrEqual(3);
        expect(result.hypotheses?.[0]?.guideSlug).toBe(result.matchedIssueSlug);
      }
    }
  );

  test("uses evidence from the message in match hypotheses", async () => {
    const message = "my computer is freezing and slow";
    const result = await provider.classify({
      message,
      platform: "Windows",
    });
    expect(result.decision).toBe("match");
    expect(
      result.hypotheses?.some((hypothesis) =>
        hypothesis.evidence.some((evidence) =>
          message.toLowerCase().includes(evidence.toLowerCase())
        )
      )
    ).toBe(true);
  });

  test.each(approvedSlugs)(
    "returns one of the approved slugs '%s' without generated steps or commands",
    async (id) => {
      const result = await provider.classify({
        message: id.replace(/-/g, " ") + " on windows",
        platform: "Windows",
      });
      expect(result).not.toHaveProperty("steps");
      expect(result).not.toHaveProperty("commands");
      if (result.matchedIssueSlug) {
        expect(approvedOutputSlugs).toContain(result.matchedIssueSlug);
      }
    }
  );

  test("detects the platform from the message", async () => {
    const result = await provider.classify({
      message: "I cannot sign in to email on my mac",
    });
    expect(result.decision).toBe("match");
    expect(result.detectedPlatform).toBe("Mac");
  });

  test.each([
    ["iPhone", "iOS"],
    ["iPad", "iOS"],
    ["iOS", "iOS"],
    ["Android", "Android"],
  ])("detects %s as %s", async (device, expectedPlatform) => {
    const result = await provider.classify({
      message: `I cannot sign in to email on my ${device}`,
    });
    expect(result.detectedPlatform).toBe(expectedPlatform);
  });

  test("asks for the platform when only mobile wording is provided", async () => {
    const result = await provider.classify({
      message: "I cannot sign in to email on my phone",
    });
    expect(result.detectedPlatform).toBeNull();
    expect(result.decision).toBe("clarify");
    expect(result.diagnosticQuestionIds).toContain("which-platform");
  });

  test("handles misspelled descriptions", async () => {
    const result = await provider.classify({
      message: "my computer is runing slow",
      platform: "Windows",
    });
    expect(result.decision).toBe("match");
    expect(result.matchedIssueSlug).toBe("slow-computer");
  });

  test("handles incomplete descriptions by asking clarifying questions", async () => {
    const result = await provider.classify({
      message: "something is wrong",
    });
    expect(result.decision).toBe("clarify");
    expect(result.diagnosticQuestionIds?.length).toBeGreaterThan(0);
    expect(result.diagnosticQuestionIds?.length).toBeLessThanOrEqual(3);
  });

  test("asks for platform when missing", async () => {
    const result = await provider.classify({
      message: "no internet",
    });
    expect(result.decision).toBe("clarify");
    expect(result.diagnosticQuestionIds).toContain("which-platform");
  });

  test("escalates unsupported or ambiguous problems", async () => {
    const result = await provider.classify({
      message: "my office chair is broken",
      platform: "Windows",
    });
    expect(result.decision).toBe("escalate");
    expect(result.escalationReason).toMatch(/not a.*support|contact your IT/i);
    expect(result.suggestedIssueSlugs?.length ?? 0).toBeLessThanOrEqual(3);
    for (const slug of result.suggestedIssueSlugs ?? []) {
      expect(approvedOutputSlugs).toContain(slug);
    }
  });

  test("matches the closest guide after questions are exhausted", async () => {
    const result = await provider.classify({
      message: "slow",
      platform: "Windows",
      previousAnswers: [
        { questionId: "where-happens", answer: "everywhere" },
        { questionId: "when-started", answer: "today" },
        { questionId: "already-restarted", answer: "yes" },
      ],
    });
    expect(result.decision).toBe("match");
    expect(result.matchedIssueSlug).toBe("slow-computer");
    expect(result.explanation).toContain("closest approved guide");
    expect(result.suggestedIssueSlugs?.length).toBeLessThanOrEqual(2);
  });

  test("returns only approved diagnostic question IDs", async () => {
    const result = await provider.classify({
      message: "computer",
    });
    if (result.decision === "clarify") {
      for (const id of result.diagnosticQuestionIds ?? []) {
        expect(diagnosticQuestions.some((q) => q.id === id)).toBe(true);
      }
    }
  });
});
