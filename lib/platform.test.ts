import { describe, expect, it } from "vitest";
import { normalizePlatform, platformSlug } from "./platform";

describe("platform normalization", () => {
  it.each([
    ["Mac", "Mac"],
    ["macos", "Mac"],
    ["WIN", "Windows"],
    [" iOS ", "iOS"],
    ["android", "Android"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePlatform(input)).toBe(expected);
  });

  it("rejects unknown values and emits slugs", () => {
    expect(normalizePlatform("linux")).toBeNull();
    expect(platformSlug("Windows")).toBe("windows");
    expect(platformSlug("iOS")).toBe("ios");
  });
});
