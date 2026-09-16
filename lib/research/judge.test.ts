import { describe, expect, test } from "vitest";
import { judgeSources } from "./judge";

describe("research judge", () => {
  test("heuristic never claims support", async () => {
    const oldKey = process.env.ANTHROPIC_API_KEY;
    const oldJudge = process.env.HELP_DESK_JUDGE_ENABLED;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.HELP_DESK_JUDGE_ENABLED = "false";
    const result = await judgeSources(
      [
        {
          url: "https://support.microsoft.com/a",
          domain: "support.microsoft.com",
          title: "DNS resolution troubleshooting",
          snippet: "DNS resolution failure causes lookup errors",
          trust: "vendor",
          contentHash: "1",
          fetchedAt: new Date().toISOString(),
        },
      ],
      [
        {
          id: "h1",
          cause: "DNS resolution failure",
          guideSlug: "dns",
          rawConfidence: 0.4,
          confidence: 0.4,
          explanation: "",
          supporting: [],
          rejecting: [],
        },
      ],
      [],
      new AbortController().signal
    );
    expect(result[0]?.judgement).not.toBe("supports");
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldKey;
    if (oldJudge === undefined) delete process.env.HELP_DESK_JUDGE_ENABLED;
    else process.env.HELP_DESK_JUDGE_ENABLED = oldJudge;
  });
});
