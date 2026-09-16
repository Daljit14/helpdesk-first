import type { TrustTier } from "./types";

export const VENDOR_DOMAINS = [
  "learn.microsoft.com",
  "support.microsoft.com",
  "support.apple.com",
  "support.google.com",
  "community.canvaslms.com",
  "instructure.com",
] as const;

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function trustTierFor(url: string): TrustTier | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return VENDOR_DOMAINS.some((domain) =>
      isDomainOrSubdomain(parsed.hostname.toLowerCase(), domain)
    )
      ? "vendor"
      : "community";
  } catch {
    return null;
  }
}
