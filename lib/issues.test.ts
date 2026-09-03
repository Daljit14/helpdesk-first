import { describe, expect, test } from "vitest";
import { CATEGORIES, DEVICES, ISSUES } from "./issues";
import { issues as legacyIssues } from "./knowledge-base";
import { getIssueBySlug } from "./search";
import { getIssueSteps } from "./steps";

describe("issue catalog", () => {
  test("contains exactly 100 unique valid issues", () => {
    expect(ISSUES).toHaveLength(100);
    expect(new Set(ISSUES.map((issue) => issue.id)).size).toBe(100);

    const categoryIds = new Set(CATEGORIES.map((category) => category.id));
    for (const issue of ISSUES) {
      expect(categoryIds).toContain(issue.category);
      for (const device of issue.devices) {
        expect(DEVICES).toContain(device);
      }
      expect(getIssueSteps(issue).length).toBeGreaterThanOrEqual(3);
    }
  });

  test("preserves legacy issue mappings and curated steps", () => {
    expect(legacyIssues).toHaveLength(30);

    for (const legacyIssue of legacyIssues) {
      const issue = getIssueBySlug(legacyIssue.slug);
      expect(issue).toBeDefined();
      expect(getIssueSteps(issue!)).toEqual(legacyIssue.steps);
    }
  });
});
