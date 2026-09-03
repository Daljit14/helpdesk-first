import {
  ISSUES,
  CATEGORIES,
  type Issue,
  type Device,
  type IssueCategoryId,
} from "./issues";

const LEGACY_SLUG_ALIASES: Record<string, string> = {
  "computer-will-not-start": "computer-wont-start",
  "blue-screen-unexpected-restart": "blue-screen",
  "no-internet-connection": "no-internet",
  "wi-fi-keeps-disconnecting": "wifi-disconnecting",
  "vpn-connection-problem": "vpn-problem",
  "printer-showing-offline": "printer-offline",
  "email-sign-in-problem": "email-sign-in",
  "application-will-not-open": "app-wont-open",
  "software-installation-problem": "install-problem",
  "application-frozen": "app-frozen",
  "wrong-default-application": "wrong-default-app",
  "camera-or-microphone-not-working": "camera-mic-not-working",
  "microphone-not-working": "mic-not-working",
  "bluetooth-headset-problem": "bluetooth-headset",
  "screen-sharing-problem": "screen-sharing",
};

export type IssueFilters = {
  query?: string;
  categoryId?: string | null;
  platform?: Device | null;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function categoryLabel(id: IssueCategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

function matchesQuery(issue: Issue, rawQuery: string): boolean {
  const query = rawQuery.trim();
  if (!query) return true;

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => normalize(token))
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return true;

  const haystack = normalize(
    [
      issue.id,
      issue.title,
      categoryLabel(issue.category),
      ...issue.symptoms,
      ...issue.devices,
    ].join(" ")
  );

  return tokens.every((token) => haystack.includes(token));
}

export function filterIssues(filters: IssueFilters): Issue[] {
  const { query = "", categoryId = null, platform = null } = filters;

  return ISSUES.filter((issue) => {
    if (categoryId && issue.category !== categoryId) {
      return false;
    }

    if (platform && !issue.devices.includes(platform)) {
      return false;
    }

    return matchesQuery(issue, query);
  });
}

export function getIssueBySlug(slug: string): Issue | undefined {
  const id = LEGACY_SLUG_ALIASES[slug] ?? slug;
  return ISSUES.find((issue) => issue.id === id);
}

export function getAllIssueSlugs(): string[] {
  return ISSUES.map((issue) => issue.id);
}
