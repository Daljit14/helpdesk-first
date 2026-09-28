import type { StepRef } from "@/lib/ai/types";
import { getIssueBySlug } from "@/lib/search";
import { getIssueSteps } from "@/lib/steps";

export function resolveStepText(
  ref: StepRef
): { title: string; text: string } | null {
  const issue = getIssueBySlug(ref.guideSlug);
  if (!issue || !Number.isInteger(ref.stepIndex) || ref.stepIndex < 0) {
    return null;
  }
  const text = getIssueSteps(issue)[ref.stepIndex];
  if (!text) return null;
  return { title: issue.title, text };
}
