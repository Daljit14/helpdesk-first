import { describe, expect, test } from "vitest";
import { scrubLearningText } from "./scrub";

describe("scrubLearningText", () => {
  test("redacts credentials", () => {
    expect(scrubLearningText("password: secret-value", 200)).toBe("[redacted]");
  });

  test("removes emails and external links", () => {
    expect(
      scrubLearningText(
        "Email help@example.com and visit https://example.com/help.",
        200
      )
    ).toBe("Email [email removed] and visit [link removed]");
  });

  test("keeps helpdesk links and trims/caps text", () => {
    expect(
      scrubLearningText(
        "  See https://helpdesk-first.vercel.app/issues/no-internet  ",
        60
      )
    ).toBe("See https://helpdesk-first.vercel.app/issues/no-internet");
    expect(scrubLearningText("  one   two three  ", 11)).toBe("one two thr");
  });
});
