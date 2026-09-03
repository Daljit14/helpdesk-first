import {
  ISSUES,
  CATEGORIES,
  type Issue,
  type Device,
  type IssueCategoryId,
} from "./issues";
import { resolveIssueId } from "./legacy-slugs";

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
  return ISSUES.find((issue) => issue.id === resolveIssueId(slug));
}

export function getAllIssueSlugs(): string[] {
  return ISSUES.map((issue) => issue.id);
}
