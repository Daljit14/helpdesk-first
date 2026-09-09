import { describe, expect, test } from "vitest";
import { ISSUES } from "@/lib/issues";
import { containsFailedStep, deriveNextSteps } from "./steps";

describe("investigation steps", () => {
  const issue = ISSUES.find((candidate) => candidate.id === "slow-computer")!;

  test("excludes failed indices and ignores other guides", () => {
    const steps = deriveNextSteps(issue, [
      { guideSlug: issue.id, stepIndex: 0 },
      { guideSlug: "wifi-disconnects", stepIndex: 1 },
    ]);
    expect(steps.some((step) => step.stepIndex === 0)).toBe(false);
    expect(steps.every((step) => step.guideSlug === issue.id)).toBe(true);
  });

  test("caps steps and detects overlap", () => {
    const steps = deriveNextSteps(issue, []);
    expect(steps.length).toBeLessThanOrEqual(8);
    expect(containsFailedStep(steps, [steps[0]!])).toBe(true);
    expect(
      containsFailedStep(steps, [{ guideSlug: "other", stepIndex: 0 }])
    ).toBe(false);
  });
});
