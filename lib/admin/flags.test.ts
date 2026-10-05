import { afterEach, describe, expect, test, vi } from "vitest";
import {
  isAgentDiagnosticSourcesEnabled,
  isAgentCostTrackingEnabled,
  isAgentModelRoutingEnabled,
  isAgentPromptCacheEnabled,
} from "./flags";

afterEach(() => vi.unstubAllEnvs());

describe("requester agent flags", () => {
  test("defaults each flag off and only accepts the exact true value", () => {
    expect(isAgentModelRoutingEnabled()).toBe(false);
    expect(isAgentPromptCacheEnabled()).toBe(false);
    expect(isAgentCostTrackingEnabled()).toBe(false);
    expect(isAgentDiagnosticSourcesEnabled()).toBe(false);

    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AGENT_PROMPT_CACHE_ENABLED", "TRUE");
    vi.stubEnv("HELP_DESK_AGENT_COST_TRACKING_ENABLED", "1");
    vi.stubEnv("HELP_DESK_AGENT_DIAGNOSTIC_SOURCES_ENABLED", "TRUE");

    expect(isAgentModelRoutingEnabled()).toBe(true);
    expect(isAgentPromptCacheEnabled()).toBe(false);
    expect(isAgentCostTrackingEnabled()).toBe(false);
    expect(isAgentDiagnosticSourcesEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_AGENT_DIAGNOSTIC_SOURCES_ENABLED", "true");
    expect(isAgentDiagnosticSourcesEnabled()).toBe(true);
  });
});
