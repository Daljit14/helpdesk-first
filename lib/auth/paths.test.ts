import { describe, expect, it } from "vitest";
import { isSafeNextPath } from "./paths";

describe("isSafeNextPath", () => {
  it("allows internal paths", () => {
    expect(isSafeNextPath("/tickets")).toBe(true);
  });

  it("rejects external and backslash paths", () => {
    expect(isSafeNextPath("//evil.com")).toBe(false);
    expect(isSafeNextPath("https://evil.com")).toBe(false);
    expect(isSafeNextPath("/\\evil.com")).toBe(false);
  });
});
