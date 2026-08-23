import { describe, expect, test } from "vitest";
import { createAiProvider } from "./mock-provider";
import { diagnosticQuestions } from "./types";
import { getAllIssueSlugs } from "@/lib/search";

const provider = createAiProvider();

describe("MockAiProvider", () => {
  test.each(getAllIssueSlugs())(
    "matches the approved issue with slug '%s' when described plainly",
    async (slug) => {
      const result = await provider.classify({
        message: slug.replace(/-/g, " ") + " on windows",
        platform: "Windows",
      });
      expect(result.decision).not.toBe("escalate");
      expect(result.matchedIssueSlug).toBe(slug);
      expect(result.explanation).toMatch(/issue|guide|troubleshoot/i);
    }
  );

  test.each(getAllIssueSlugs())(
    "returns one of the approved slugs '%s' without generated steps or commands",
    async (slug) => {
      const result = await provider.classify({
        message: slug.replace(/-/g, " ") + " on windows",
        platform: "Windows",
      });
      expect(result).not.toHaveProperty("steps");
      expect(result).not.toHaveProperty("commands");
      if (result.matchedIssueSlug) {
        expect(getAllIssueSlugs()).toContain(result.matchedIssueSlug);
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
