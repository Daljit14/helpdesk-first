import { isBlockedVendorHost, VENDOR_DOMAINS } from "@/lib/research/allowlist";
import type { SourceTier } from "./types";

export const REFERENCE_DOMAINS = [
  "wikipedia.org",
  "developer.mozilla.org",
] as const;

export const QA_COMMUNITY_DOMAINS = [
  "stackoverflow.com",
  "superuser.com",
  "serverfault.com",
  "askubuntu.com",
  "stackexchange.com",
] as const;

export const REDDIT_DOMAINS = [
  "reddit.com",
  "redd.it",
  "redditmedia.com",
  "redditstatic.com",
] as const;

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function matchesDomain(hostname: string, domains: readonly string[]): boolean {
  return domains.some((domain) => isDomainOrSubdomain(hostname, domain));
}

export function isRedditHost(hostname: string): boolean {
  return matchesDomain(normalizedHost(hostname), REDDIT_DOMAINS);
}

export function answerTierFor(
  url: string,
  orgDomains: readonly string[] = []
): SourceTier | null {
  let hostname: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      return null;
    hostname = normalizedHost(parsed.hostname);
  } catch {
    return null;
  }

  if (
    orgDomains.some((rawDomain) => {
      const domain = normalizedHost(rawDomain);
      return (
        isDomainOrSubdomain(hostname, domain) && !isBlockedVendorHost(hostname)
      );
    })
  )
    return "org_approved";
  if (matchesDomain(hostname, VENDOR_DOMAINS)) return "vendor";
  if (matchesDomain(hostname, REFERENCE_DOMAINS)) return "reference";
  if (matchesDomain(hostname, QA_COMMUNITY_DOMAINS)) return "qa_community";
  return "community";
}

export function registrableDomain(hostname: string): string {
  const labels = normalizedHost(hostname)
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels.at(-1) ?? "";
  const secondToLast = labels.at(-2) ?? "";
  const publicSecondLevel = new Set([
    "co",
    "com",
    "org",
    "net",
    "gov",
    "ac",
    "edu",
  ]);
  const count = tld.length === 2 && publicSecondLevel.has(secondToLast) ? 3 : 2;
  return labels.slice(-count).join(".");
}
