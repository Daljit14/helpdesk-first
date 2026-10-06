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

  test("trusts only organization-approved domains and their subdomains", () => {
    const orgDomains = ["support.contoso-vpn.com"];
    expect(trustTierFor("https://support.contoso-vpn.com/kb", orgDomains)).toBe(
      "vendor"
    );
    expect(
      trustTierFor("https://kb.support.contoso-vpn.com/kb", orgDomains)
    ).toBe("vendor");
    expect(trustTierFor("https://support.contoso-vpn.com/kb")).toBe(
      "community"
    );
    expect(
      trustTierFor(
        "https://support.contoso-vpn.com.evil.example/kb",
        orgDomains
      )
    ).toBe("community");
  });

  test("keeps blocked hosts untrusted even when injected as org domains", () => {
    expect(trustTierFor("https://repo.github.io/docs", ["github.io"])).toBe(
      "community"
    );
  });
});
