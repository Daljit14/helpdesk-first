import type { createAdminClient } from "@/lib/supabase/admin";
import { isOrgVendorDomainsEnabled } from "@/lib/admin/flags";
import { isBlockedVendorHost, VENDOR_DOMAINS } from "./allowlist";

export { isBlockedVendorHost };

export const ORG_VENDOR_DOMAIN_LIMIT = 25;

export type OrgVendorDomainRejection =
  | "invalid"
  | "not_https"
  | "ip_address"
  | "wildcard"
  | "blocked"
  | "public_suffix"
  | "already_official";

const DOMAIN_PATTERN =
  /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const PUBLIC_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.jp",
  "co.in",
  "co.za",
  "com.br",
  "com.cn",
  "com.mx",
  "com.sg",
  "com.tr",
]);

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function normalizeOrgVendorDomain(
  raw: string
):
  | { ok: true; domain: string }
  | { ok: false; reason: OrgVendorDomainRejection } {
  const value = raw.trim().toLowerCase();
  if (!value || value.length > 253) return { ok: false, reason: "invalid" };
  if (value.includes("*")) return { ok: false, reason: "wildcard" };

  let hostname: string;
  if (value.includes("://")) {
    if (!value.startsWith("https://"))
      return { ok: false, reason: "not_https" };
    try {
      const parsed = new URL(value);
      const authority = value.slice("https://".length).split(/[/?#]/, 1)[0];
      if (
        parsed.port ||
        parsed.username ||
        parsed.password ||
        (authority && /(?:\[[^\]]+\]|[^:]+):\d+$/.test(authority))
      )
        return { ok: false, reason: "invalid" };
      hostname = parsed.hostname.toLowerCase();
    } catch {
      return { ok: false, reason: "invalid" };
    }
  } else {
    if (/[/?#@\s]/.test(value)) return { ok: false, reason: "invalid" };
    hostname = value;
  }

  if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
  if (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":") ||
    hostname.includes("[")
  )
    return { ok: false, reason: "ip_address" };
  if (!DOMAIN_PATTERN.test(hostname)) return { ok: false, reason: "invalid" };
  if (PUBLIC_SUFFIXES.has(hostname))
    return { ok: false, reason: "public_suffix" };
  if (isBlockedVendorHost(hostname)) return { ok: false, reason: "blocked" };
  if (VENDOR_DOMAINS.some((domain) => isDomainOrSubdomain(hostname, domain)))
    return { ok: false, reason: "already_official" };
  return { ok: true, domain: hostname };
}

export async function loadOrgVendorDomains(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string
): Promise<string[]> {
  if (!isOrgVendorDomainsEnabled()) return [];
  try {
    const result = await admin
      .from("org_research_vendor_domains")
      .select("domain")
      .eq("organization_id", organizationId)
      .order("created_at")
      .limit(ORG_VENDOR_DOMAIN_LIMIT);
    if (result.error || !Array.isArray(result.data)) return [];
    const domains = new Set<string>();
    for (const row of result.data) {
      if (!row || typeof row.domain !== "string") continue;
      const normalized = normalizeOrgVendorDomain(row.domain);
      if (normalized.ok) domains.add(normalized.domain);
    }
    return [...domains];
  } catch {
    return [];
  }
}
