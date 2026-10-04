import { afterEach, describe, expect, test, vi } from "vitest";
import { getAgentPlannerModel, getOrgDailyCostCapMicros } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("agent model configuration", () => {
  test("trims the planner model and returns null when unset", () => {
    vi.stubEnv("HELP_DESK_AGENT_PLANNER_MODEL", "  claude-sonnet-5  ");
    expect(getAgentPlannerModel()).toBe("claude-sonnet-5");

    vi.stubEnv("HELP_DESK_AGENT_PLANNER_MODEL", " ");
    expect(getAgentPlannerModel()).toBeNull();
  });

  test("defaults the organization cost cap to ten dollars", () => {
    vi.stubEnv("HELP_DESK_AI_ORG_DAILY_COST_CAP_USD", "");
    expect(getOrgDailyCostCapMicros()).toBe(10_000_000);
  });

  test("rounds valid dollar values to micros and accepts zero", () => {
    vi.stubEnv("HELP_DESK_AI_ORG_DAILY_COST_CAP_USD", "1.2345678");
    expect(getOrgDailyCostCapMicros()).toBe(1_234_568);

    vi.stubEnv("HELP_DESK_AI_ORG_DAILY_COST_CAP_USD", "0");
    expect(getOrgDailyCostCapMicros()).toBe(0);
  });

  test.each(["-1", "NaN", "Infinity"])(
    "uses the default cap for invalid value %s",
    (value) => {
      vi.stubEnv("HELP_DESK_AI_ORG_DAILY_COST_CAP_USD", value);
      expect(getOrgDailyCostCapMicros()).toBe(10_000_000);
    }
  );
});
