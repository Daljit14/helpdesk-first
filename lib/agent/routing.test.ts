import { describe, expect, test } from "vitest";
import { countEvidenceSources, selectAgentRoute } from "./routing";

const env = {
  enabled: true,
  plannerModel: "claude-sonnet-5",
  defaultModel: "claude-haiku-4-5-20251001",
};

describe("agent model routing", () => {
  test.each([
    [
      {
        evidenceSources: 2,
        failedVerification: false,
        screenshotAttached: false,
      },
      "multiple_hypotheses",
    ],
    [
      {
        evidenceSources: 0,
        failedVerification: true,
        screenshotAttached: false,
      },
      "failed_verification",
    ],
    [
      {
        evidenceSources: 0,
        failedVerification: false,
        screenshotAttached: true,
      },
      "screenshot",
    ],
  ] as const)("selects planner for the %s reason", (signals, reason) => {
    expect(selectAgentRoute(signals, env)).toEqual({
      tier: "planner",
      model: "claude-sonnet-5",
      reasons: [reason],
    });
  });

  test("computes reasons while routing is disabled", () => {
    expect(
      selectAgentRoute(
        {
          evidenceSources: 2,
          failedVerification: false,
          screenshotAttached: false,
        },
        { ...env, enabled: false }
      )
    ).toEqual({
      tier: "default",
      model: env.defaultModel,
      reasons: ["multiple_hypotheses"],
    });
  });

  test("uses default tier when no planner model is configured", () => {
    expect(
      selectAgentRoute(
        {
          evidenceSources: 0,
          failedVerification: true,
          screenshotAttached: false,
        },
        { ...env, plannerModel: null }
      )
    ).toEqual({
      tier: "default",
      model: env.defaultModel,
      reasons: ["failed_verification"],
    });
  });

  test("does not count guide search results as independent evidence sources", () => {
    expect(
      countEvidenceSources([
        { tool: "search_guides" },
        { tool: "search_guides" },
      ])
    ).toBe(0);
    expect(
      countEvidenceSources([
        { tool: "search_guides" },
        { tool: "get_device_diagnostics" },
      ])
    ).toBe(1);
  });

  test("does not count organization environment profiles as evidence sources", () => {
    expect(
      countEvidenceSources([
        { tool: "get_org_environment" },
        { tool: "search_guides" },
        { tool: "get_device_diagnostics" },
      ])
    ).toBe(1);
  });

  test("does not count similar-issue research as an evidence source", () => {
    expect(
      countEvidenceSources([
        { tool: "count_similar_org_issues" },
        { tool: "get_device_diagnostics" },
      ])
    ).toBe(1);
  });
});
