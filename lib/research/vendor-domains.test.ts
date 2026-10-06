import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  loadOrgVendorDomains,
  normalizeOrgVendorDomain,
  ORG_VENDOR_DOMAIN_LIMIT,
} from "./vendor-domains";

const organizationId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.stubEnv("HELP_DESK_ORG_VENDOR_DOMAINS_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeOrgVendorDomain", () => {
  test.each([
    ["support.contoso-vpn.com", "support.contoso-vpn.com"],
    ["https://Support.Contoso-VPN.com/kb/1", "support.contoso-vpn.com"],
    ["support.contoso-vpn.com.", "support.contoso-vpn.com"],
  ])("normalizes %s", (raw, domain) => {
    expect(normalizeOrgVendorDomain(raw)).toEqual({ ok: true, domain });
  });

  test.each([
    ["", "invalid"],
    ["a".repeat(254), "invalid"],
    ["http://x.com", "not_https"],
    ["*.x.com", "wildcard"],
    ["1.2.3.4", "ip_address"],
    ["[::1]", "ip_address"],
    ["https://[::1]", "ip_address"],
    ["localhost", "invalid"],
    ["vendor", "invalid"],
    ["a b.com", "invalid"],
    ["x.com/path", "invalid"],
    ["https://x.com:8443", "invalid"],
    ["https://x.com:443", "invalid"],
    ["https://u:p@x.com", "invalid"],
    ["reddit.com", "blocked"],
    ["old.reddit.com", "blocked"],
    ["google.com", "blocked"],
    ["microsoft.com", "blocked"],
    ["bit.ly", "blocked"],
    ["pastebin.com", "blocked"],
    ["user.github.io", "blocked"],
    ["co.uk", "public_suffix"],
    ["learn.microsoft.com", "already_official"],
    ["sub.learn.microsoft.com", "already_official"],
  ] as const)("rejects %s as %s", (raw, reason) => {
    expect(normalizeOrgVendorDomain(raw)).toEqual({ ok: false, reason });
  });
});

describe("loadOrgVendorDomains", () => {
  test("returns no domains without querying when the flag is off", async () => {
    vi.stubEnv("HELP_DESK_ORG_VENDOR_DOMAINS_ENABLED", "false");
    const from = vi.fn();
    await expect(
      loadOrgVendorDomains({ from } as never, organizationId)
    ).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  test("loads only the organization's validated, unique domains", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        { domain: "support.contoso-vpn.com" },
        { domain: "support.contoso-vpn.com" },
        { domain: "reddit.com" },
        { domain: "not a domain" },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const admin = { from };

    await expect(
      loadOrgVendorDomains(admin as never, organizationId)
    ).resolves.toEqual(["support.contoso-vpn.com"]);
    expect(from).toHaveBeenCalledWith("org_research_vendor_domains");
    expect(select).toHaveBeenCalledWith("domain");
    expect(eq).toHaveBeenCalledWith("organization_id", organizationId);
    expect(order).toHaveBeenCalledWith("created_at");
    expect(limit).toHaveBeenCalledWith(ORG_VENDOR_DOMAIN_LIMIT);
  });

  test("fails closed when the query errors or throws", async () => {
    const errored = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: null, error: new Error("missing") }),
            }),
          }),
        }),
      }),
    };
    await expect(
      loadOrgVendorDomains(errored as never, organizationId)
    ).resolves.toEqual([]);

    const thrown = {
      from: () => {
        throw new Error("unavailable");
      },
    };
    await expect(
      loadOrgVendorDomains(thrown as never, organizationId)
    ).resolves.toEqual([]);
  });
});
