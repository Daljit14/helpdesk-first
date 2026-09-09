import { getIssueSteps } from "@/lib/steps";
import type { Issue } from "@/lib/issues";
import type { StepRef } from "@/lib/ai/types";

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
  failedSteps: StepRef[]
): StepRef[] {
  const refs = getIssueSteps(issue).map((_, stepIndex) => ({
    guideSlug: issue.id,
    stepIndex,
  }));
  return refs
    .filter(
      (step) =>
        !failedSteps.some(
          (failed) =>
            failed.guideSlug === issue.id && failed.stepIndex === step.stepIndex
        )
    )
    .slice(0, 8);
}
