import { describe, expect, it } from "vitest";
import { isSafeNextPath, safeNextPath } from "./paths";

describe("isSafeNextPath", () => {
  it("allows internal paths", () => {
    expect(isSafeNextPath("/tickets")).toBe(true);
  });

  it("rejects external and backslash paths", () => {
    expect(isSafeNextPath("//evil.com")).toBe(false);
    expect(isSafeNextPath("https://evil.com")).toBe(false);
    expect(isSafeNextPath("/\\evil.com")).toBe(false);
  });

  it.each([
    "/\\evil.com",
    "/\\/evil.com",
    "//evil.com",
    decodeURIComponent("/%5C%5Cevil.com"),
    "https://evil.com",
    "/\tevil.com",
    "javascript:alert(1)",
    "",
    null,
    "/" + "a".repeat(2048),
  ])("falls back for unsafe path %s", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("preserves safe internal paths", () => {
    expect(safeNextPath("/tickets")).toBe("/tickets");
    expect(safeNextPath("/issues/slow-computer?x=1#top")).toBe(
      "/issues/slow-computer?x=1#top"
    );
  });

  it("supports an admin fallback", () => {
    expect(safeNextPath("//evil.com", "/admin/operations")).toBe(
      "/admin/operations"
    );
  });
});
