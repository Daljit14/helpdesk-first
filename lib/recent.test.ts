import { beforeEach, describe, expect, test } from "vitest";
import { getRecentlyViewed, pushRecentlyViewed } from "./recent";

describe("recently viewed issues", () => {
  beforeEach(() => localStorage.clear());

  test("keeps the most recent issue first", () => {
    pushRecentlyViewed("one");
    pushRecentlyViewed("two");
    expect(getRecentlyViewed()).toEqual(["two", "one"]);
  });

  test("deduplicates an issue when it is viewed again", () => {
    pushRecentlyViewed("one");
    pushRecentlyViewed("two");
    pushRecentlyViewed("one");
    expect(getRecentlyViewed()).toEqual(["one", "two"]);
  });

  test("caps the list at eight issues", () => {
    for (let index = 0; index < 10; index += 1) {
      pushRecentlyViewed(`issue-${index}`);
    }
    expect(getRecentlyViewed()).toHaveLength(8);
    expect(getRecentlyViewed()[0]).toBe("issue-9");
    expect(getRecentlyViewed()[7]).toBe("issue-2");
  });
});
