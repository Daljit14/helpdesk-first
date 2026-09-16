import { describe, expect, test } from "vitest";
import { buildResearchQueries } from "./query";

describe("research query builder", () => {
  test("uses bounded diagnosis fields and never ticket identity data", () => {
    const queries = buildResearchQueries({
      category: "network",
      platform: "Windows",
      hypotheses: [
        {
          id: "h1",
          cause: "DNS resolution failure",
          guideSlug: "dns-guide",
          rawConfidence: 0.4,
          confidence: 0.4,
          explanation: "",
          supporting: [],
          rejecting: [],
        },
      ],
      guideTitles: ["DNS troubleshooting"],
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((query) => query.length <= 120)).toBe(true);
    expect(queries.join(" ")).not.toContain("alice@example.com");
    expect(queries.join(" ")).not.toContain("ticket-123");
  });
});
