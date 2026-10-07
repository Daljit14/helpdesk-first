import type { TrustTier } from "./types";

export const VENDOR_DOMAINS = [
  "learn.microsoft.com",
  "support.microsoft.com",
  "support.apple.com",
  "support.google.com",
  "community.canvaslms.com",
  "instructure.com",
] as const;

export const REFERENCE_DOMAINS = [
  "wikipedia.org",
  "developer.mozilla.org",
] as const;

export const BLOCKED_VENDOR_DOMAINS = [
  "reddit.com",
  "redd.it",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "t.co",
  "tiktok.com",
  "linkedin.com",
  "lnkd.in",
  "youtube.com",
  "youtu.be",
  "pinterest.com",
  "tumblr.com",
  "quora.com",
  "medium.com",
  "substack.com",
  "discord.com",
  "discord.gg",
  "t.me",
  "telegram.org",
  "whatsapp.com",
  "stackoverflow.com",
  "stackexchange.com",
  "superuser.com",
  "serverfault.com",
  "answers.microsoft.com",
  "techcommunity.microsoft.com",
  "discussions.apple.com",
  "pastebin.com",
  "paste.ee",
  "hastebin.com",
  "ghostbin.com",
  "rentry.co",
  "justpaste.it",
  "github.com",
  "gist.github.com",
  "githubusercontent.com",
  "github.io",
  "gitlab.com",
  "gitlab.io",
  "bitbucket.org",
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "tiny.cc",
  "sites.google.com",
  "docs.google.com",
  "drive.google.com",
  "blogspot.com",
  "wordpress.com",
  "wixsite.com",
  "weebly.com",
  "notion.site",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "herokuapp.com",
  "web.app",
  "firebaseapp.com",
  "appspot.com",
  "azurewebsites.net",
  "cloudfront.net",
  "amazonaws.com",
  "blob.core.windows.net",
  "dropbox.com",
  "box.com",
  "onedrive.live.com",
  "sharepoint.com",
] as const;

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isBlockedVendorHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return BLOCKED_VENDOR_DOMAINS.some(
    (domain) =>
      isDomainOrSubdomain(host, domain) || isDomainOrSubdomain(domain, host)
  );
}

export function trustTierFor(
  url: string,
  orgDomains: readonly string[] = []
): TrustTier | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const hostname = parsed.hostname.toLowerCase();
    if (VENDOR_DOMAINS.some((domain) => isDomainOrSubdomain(hostname, domain)))
      return "vendor";
    if (
      REFERENCE_DOMAINS.some((domain) => isDomainOrSubdomain(hostname, domain))
    )
      return "reference";
    return orgDomains.some(
      (domain) =>
        isDomainOrSubdomain(hostname, domain) && !isBlockedVendorHost(hostname)
    )
      ? "vendor"
      : "community";
  } catch {
    return null;
  }
}
