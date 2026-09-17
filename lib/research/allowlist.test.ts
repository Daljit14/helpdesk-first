import { describe, expect, test } from "vitest";
import { trustTierFor } from "./allowlist";

describe("research trust allowlist", () => {
  test("accepts exact vendor domains and valid subdomains", () => {
    expect(trustTierFor("https://learn.microsoft.com/article")).toBe("vendor");
    expect(trustTierFor("https://sub.learn.microsoft.com/article")).toBe(
      "vendor"
    );
    expect(trustTierFor("https://learn.microsoft.com.evil.example")).toBe(
      "community"
    );
    expect(trustTierFor("http://learn.microsoft.com")).toBeNull();
  });
});
