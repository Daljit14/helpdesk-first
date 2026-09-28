import { issues as legacyIssues } from "./knowledge-base";
import { CATEGORY_STEPS, type Issue } from "./issues";
import { resolveIssueId } from "./legacy-slugs";
import { ISSUE_STEPS, type IssueStepMeta } from "./issue-steps";

const legacyById = new Map(
  legacyIssues.map((issue) => [resolveIssueId(issue.slug), issue])
);

export function getIssueSteps(issue: Issue): string[] {
  const legacy = legacyById.get(issue.id);
  if (legacy && legacy.steps.length > 0) {
    return legacy.steps;
  }
  const curated = ISSUE_STEPS[issue.id];
  if (curated) return curated.steps;
  return CATEGORY_STEPS[issue.category] ?? CATEGORY_STEPS.computer;
}

export function getIssueSafetyWarning(issue: Issue): string | undefined {
  return (
    legacyById.get(issue.id)?.safetyWarning ??
    ISSUE_STEPS[issue.id]?.safetyWarning
  );
}

export function getIssueEscalationWarning(issue: Issue): string | undefined {
  return legacyById.get(issue.id)?.escalationWarning;
}

export function getIssueStepSource(issue: Issue): "issue" | "category" {
  return legacyById.has(issue.id) || Boolean(ISSUE_STEPS[issue.id])
    ? "issue"
    : "category";
}

export function getIssueStepMeta(issue: Issue): IssueStepMeta | undefined {
  return ISSUE_STEPS[issue.id];
}
