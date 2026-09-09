import { afterEach, describe, expect, test } from "vitest";
import { createAiProvider } from "../mock-provider";
import { EVAL_CASES, runEval } from "./eval";
import { processAiIntake } from "../intake";
import { runInvestigationTurn } from "@/lib/investigation/engine";

afterEach(() => {
  delete process.env.HELP_DESK_AI_ENABLED;
});

describe("grounded AI evaluation", () => {
  test("covers every required evaluation category", () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(EVAL_CASES.map((item) => item.category))).toEqual(
      new Set([
        "supported",
        "unknown",
        "ambiguous_platform",
        "unsafe",
        "secrets",
        "prompt_injection",
        "attachment_injection",
        "cross_tenant",
        "failed_steps",
      ])
    );
  });

  test("passes the fixed cases through intake safety and coercion", async () => {
    process.env.HELP_DESK_AI_ENABLED = "true";
    const result = await runEval(createAiProvider());
    expect(result.total).toBe(EVAL_CASES.length);
    expect(result.unsafeEscapes).toBe(0);
    expect(result.unapprovedSlugs).toBe(0);
    expect(result.cases.filter((item) => !item.pass)).toEqual([]);
    for (const testCase of EVAL_CASES.filter(
      (item) => item.category !== "supported"
    )) {
      const evaluated = result.cases.find(
        (item) => item.name === testCase.name
      );
      expect(evaluated?.output).not.toMatchObject({
        decision: "match",
      });
    }
  });

  test("drops an unapproved hypothesis guide slug", async () => {
    process.env.HELP_DESK_AI_ENABLED = "true";
    const result = await processAiIntake(
      { message: "slow computer", platform: "Windows" },
      {
        provider: {
          classify: async () => ({
            decision: "match",
            matchedIssueSlug: "slow-computer",
            detectedPlatform: "Windows",
            explanation: "A guide matches.",
            hypotheses: [
              {
                cause: "Unknown",
                confidence: 0.8,
                evidence: ["slow computer"],
                guideSlug: "not-approved",
              },
            ],
          }),
        },
        allowedSlugs: ["slow-computer"],
      }
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.output.hypotheses?.[0]?.guideSlug).toBeUndefined();
    }
  });

  test("provider next steps never reach the intake caller", async () => {
    process.env.HELP_DESK_AI_ENABLED = "true";
    const result = await processAiIntake(
      { message: "slow computer", platform: "Windows" },
      {
        provider: {
          classify: async () => ({
            decision: "match",
            matchedIssueSlug: "slow-computer",
            detectedPlatform: "Windows",
            explanation: "A guide matches.",
            nextSteps: [{ guideSlug: "slow-computer", stepIndex: 99 }],
          }),
        },
        allowedSlugs: ["slow-computer"],
      }
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.output.nextSteps).toBeUndefined();
    }
  });

  test("provider next steps cannot re-recommend a failed step", async () => {
    process.env.HELP_DESK_AI_ENABLED = "true";
    const result = await runInvestigationTurn({
      input: {
        message: "slow computer",
        platform: "Windows",
        failedSteps: [{ guideSlug: "slow-computer", stepIndex: 0 }],
      },
      provider: {
        classify: async () => ({
          decision: "match",
          matchedIssueSlug: "slow-computer",
          detectedPlatform: "Windows",
          explanation: "A guide matches.",
          nextSteps: [{ guideSlug: "slow-computer", stepIndex: 0 }],
        }),
      },
      allowedSlugs: ["slow-computer"],
      persist: false,
    });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(
        result.output.nextSteps?.some(
          (step) => step.guideSlug === "slow-computer" && step.stepIndex === 0
        )
      ).toBe(false);
    }
  });
});
