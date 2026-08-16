import { issues, type Issue } from "./knowledge-base";
import type { Platform } from "./helpdesk-data";

export type IssueFilters = {
  query?: string;
  categoryId?: string | null;
  platform?: Platform | null;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
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
    [issue.title, ...issue.symptoms, ...issue.keywords].join(" ")
  );

  return tokens.every((token) => haystack.includes(token));
}

export function filterIssues(filters: IssueFilters): Issue[] {
  const { query = "", categoryId = null, platform = null } = filters;

  return issues.filter((issue) => {
    if (categoryId && issue.categoryId !== categoryId) {
      return false;
    }

    if (platform && !issue.platforms.includes(platform)) {
      return false;
    }

    return matchesQuery(issue, query);
  });
}

export function getIssueBySlug(slug: string): Issue | undefined {
  return issues.find((issue) => issue.slug === slug);
}

export function getAllIssueSlugs(): string[] {
  return issues.map((issue) => issue.slug);
}
