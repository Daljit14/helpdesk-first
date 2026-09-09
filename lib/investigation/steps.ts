import type { Issue } from "@/lib/issues";
import type { StepRef } from "@/lib/ai/types";
import type { Audience } from "./policy";
import { getIssueStepPolicies, isOfferable } from "./policy";

export function containsFailedStep(
  steps: StepRef[],
  failedSteps: StepRef[]
): boolean {
  return steps.some((step) =>
    failedSteps.some(
      (failed) =>
        failed.guideSlug === step.guideSlug &&
        failed.stepIndex === step.stepIndex
    )
  );
}

export function deriveNextSteps(
  issue: Issue,
  failedSteps: StepRef[],
  audience: Audience = "requester"
): StepRef[] {
  return getIssueStepPolicies(issue)
    .filter((step) => isOfferable(step.risk, audience))
    .map(({ guideSlug, stepIndex, risk }) => ({ guideSlug, stepIndex, risk }))
    .filter(
      (step) =>
        !failedSteps.some(
          (failed) =>
            failed.guideSlug === issue.id && failed.stepIndex === step.stepIndex
        )
    )
    .slice(0, 8);
}

export function deriveWithheldSteps(
  issue: Issue,
  audience: Audience = "requester"
): StepRef[] {
  return getIssueStepPolicies(issue)
    .filter((step) => !isOfferable(step.risk, audience))
    .map(({ guideSlug, stepIndex, risk }) => ({ guideSlug, stepIndex, risk }));
}
