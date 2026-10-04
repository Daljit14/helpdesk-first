import { afterEach, describe, expect, test, vi } from "vitest";
import {
  isAgentCostTrackingEnabled,
  isAgentModelRoutingEnabled,
  isAgentPromptCacheEnabled,
} from "./flags";

afterEach(() => vi.unstubAllEnvs());

describe("requester agent D4 flags", () => {
  test("defaults each flag off and only accepts the exact true value", () => {
    expect(isAgentModelRoutingEnabled()).toBe(false);
    expect(isAgentPromptCacheEnabled()).toBe(false);
    expect(isAgentCostTrackingEnabled()).toBe(false);

    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AGENT_PROMPT_CACHE_ENABLED", "TRUE");
    vi.stubEnv("HELP_DESK_AGENT_COST_TRACKING_ENABLED", "1");

    expect(isAgentModelRoutingEnabled()).toBe(true);
    expect(isAgentPromptCacheEnabled()).toBe(false);
    expect(isAgentCostTrackingEnabled()).toBe(false);
  });
});
