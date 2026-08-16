import { test, expect, describe } from "vitest";
import { issues } from "./knowledge-base";
import { categories, platforms } from "./helpdesk-data";

const categoryIds = categories.map((category) => category.id);
const platformSet = new Set(platforms);

const networkIssueSlugs = new Set([
  "no-internet-connection",
  "wi-fi-keeps-disconnecting",
]);

describe("knowledge base data", () => {
  test("contains at least 12 issues", () => {
    expect(issues.length).toBeGreaterThanOrEqual(12);
  });

  test("has no duplicate slugs", () => {
    const slugs = issues.map((issue) => issue.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("every issue uses a valid category", () => {
    for (const issue of issues) {
      expect(categoryIds).toContain(issue.categoryId);
    }
  });

  test("every issue uses only valid platforms", () => {
    for (const issue of issues) {
      for (const platform of issue.platforms) {
        expect(platformSet).toContain(platform);
      }
    }
  });

  test("every issue has a title, steps and estimated time", () => {
    for (const issue of issues) {
      expect(issue.title.trim()).not.toBe("");
      expect(issue.steps.length).toBeGreaterThan(0);
      expect(issue.estimatedTimeMinutes).toBeGreaterThan(0);
    }
  });

  test("network issues include authorization guidance before restarting equipment", () => {
    for (const issue of issues) {
      if (!networkIssueSlugs.has(issue.slug)) continue;

      const combined = [
        issue.safetyWarning ?? "",
        issue.escalationWarning ?? "",
        ...issue.steps,
      ].join(" ");

      const hasAuthorization =
        /authorized|own it|contact IT|workplace|school|shared network/i.test(
          combined
        );
      expect(
        hasAuthorization,
        `${issue.title} should guide users to only restart equipment they own or are authorized to restart`
      ).toBe(true);
    }
  });

  test("no keyword has unnecessary leading or trailing spaces", () => {
    for (const issue of issues) {
      for (const keyword of issue.keywords) {
        expect(keyword).toBe(keyword.trim());
      }
    }
  });

  test("email syncing issue warns about re-adding accounts", () => {
    const emailIssue = issues.find(
      (issue) => issue.slug === "email-not-syncing"
    );
    expect(emailIssue).toBeDefined();
    const warnings = [
      emailIssue?.safetyWarning ?? "",
      emailIssue?.escalationWarning ?? "",
      ...emailIssue!.steps,
    ].join(" ");
    expect(warnings).toMatch(/re-add/i);
    expect(warnings).toMatch(/local/i);
    expect(warnings).toMatch(/IT/i);
  });
});
