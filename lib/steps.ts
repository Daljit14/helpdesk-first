import { issues as legacyIssues } from "./knowledge-base";
import { CATEGORY_STEPS, type Issue } from "./issues";
import { resolveIssueId } from "./legacy-slugs";

const legacyById = new Map(
  legacyIssues.map((issue) => [resolveIssueId(issue.slug), issue])
);

export function getIssueSteps(issue: Issue): string[] {
  const legacy = legacyById.get(issue.id);
  if (legacy && legacy.steps.length > 0) {
    return legacy.steps;
  }
  return CATEGORY_STEPS[issue.category] ?? CATEGORY_STEPS.computer;
}

export function getIssueSafetyWarning(issue: Issue): string | undefined {
  return legacyById.get(issue.id)?.safetyWarning;
}

export function getIssueEscalationWarning(issue: Issue): string | undefined {
  return legacyById.get(issue.id)?.escalationWarning;
}
