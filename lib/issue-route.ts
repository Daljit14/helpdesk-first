const ISSUE_ROUTE_PATTERN = /^\/issues\/([^/]+)(\/guide)?\/?$/;

export function parseIssueRoutePath(
  pathname: string
): { slug: string; guide: boolean } | null {
  const match = ISSUE_ROUTE_PATTERN.exec(pathname);
  if (!match) return null;
  try {
    return {
      slug: decodeURIComponent(match[1]),
      guide: Boolean(match[2]),
    };
  } catch {
    return null;
  }
}
