import { test, expect } from "vitest";
import { filterIssues, getIssueBySlug } from "./search";

test("empty filters return all issues", () => {
  expect(filterIssues({})).toHaveLength(100);
});

test("search is case-insensitive", () => {
  const results = filterIssues({ query: "SLOW COMPUTER" });
  expect(results).toHaveLength(1);
  expect(results[0].title).toBe("Slow computer");
});

test("search matches symptoms and keywords", () => {
  const results = filterIssues({ query: "black screen" });
  expect(results.map((issue) => issue.title)).toContain(
    "Computer will not start"
  );
});

test("search normalizes punctuation and hyphens", () => {
  const wifiResults = filterIssues({ query: "wi-fi" });
  expect(wifiResults.map((issue) => issue.title)).toContain(
    "Wi-Fi keeps disconnecting"
  );
  expect(wifiResults.length).toBeGreaterThanOrEqual(1);

  expect(
    filterIssues({ query: "won't" }).map((issue) => issue.title)
  ).toContain("Computer will not start");
});

test("category filter returns only matching issues", () => {
  const printerIssues = filterIssues({ categoryId: "printer" });
  expect(printerIssues).toHaveLength(5);
  expect(printerIssues.every((issue) => issue.category === "printer")).toBe(
    true
  );
});

test("platform filter returns only matching issues", () => {
  const mobileIssues = filterIssues({ platform: "Mobile" });
  expect(
    mobileIssues.every((issue) => issue.devices.includes("Mobile"))
  ).toBe(true);
  expect(mobileIssues.length).toBeLessThan(100);
});

test("combined filters narrow results", () => {
  const results = filterIssues({
    query: "print",
    categoryId: "printer",
    platform: "Windows",
  });
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((issue) => issue.category === "printer")).toBe(true);
  expect(results.every((issue) => issue.devices.includes("Windows"))).toBe(
    true
  );
});

test("filters can return an empty result set", () => {
  expect(filterIssues({ query: "nonexistent problem xyz" })).toHaveLength(0);
});

test("getIssueBySlug returns the correct issue", () => {
  expect(getIssueBySlug("no-sound")?.title).toBe("No sound");
  expect(getIssueBySlug("does-not-exist")).toBeUndefined();
});
