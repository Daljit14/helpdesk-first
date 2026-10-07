import { afterEach, describe, expect, test, vi } from "vitest";
import {
  isAgentDiagnosticSourcesEnabled,
  isAgentUserStepsEnabled,
  isAgentCostTrackingEnabled,
  isAgentModelRoutingEnabled,
  isAgentPromptCacheEnabled,
  isAnswerEngineEnabled,
  isAnswerEnginePublicEnabled,
  isAnswerEnginePageFetchEnabled,
  isStackExchangeSourceEnabled,
  isWikipediaSourceEnabled,
  getAgentAbandonMinutes,
  isAgentAbandonSweepEnabled,
  getIdentityAssuranceFreshMinutes,
  isIdentityAssuranceEnabled,
} from "./flags";

afterEach(() => vi.unstubAllEnvs());

describe("requester agent flags", () => {
  test("keeps answer-engine flags disabled unless explicitly enabled", () => {
    expect(isAnswerEngineEnabled()).toBe(false);
    expect(isAnswerEnginePublicEnabled()).toBe(false);
    expect(isWikipediaSourceEnabled()).toBe(false);
    expect(isStackExchangeSourceEnabled()).toBe(false);
    expect(isAnswerEnginePageFetchEnabled()).toBe(false);

    vi.stubEnv("HELP_DESK_ANSWER_ENGINE_PUBLIC_ENABLED", "true");
    expect(isAnswerEnginePublicEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_ANSWER_ENGINE_ENABLED", "true");
    expect(isAnswerEngineEnabled()).toBe(true);
    expect(isAnswerEnginePublicEnabled()).toBe(true);
    vi.stubEnv("HELP_DESK_SOURCE_WIKIPEDIA_ENABLED", "true");
    vi.stubEnv("HELP_DESK_SOURCE_STACKEXCHANGE_ENABLED", "true");
    vi.stubEnv("HELP_DESK_PAGE_FETCH_ENABLED", "true");
    expect(isWikipediaSourceEnabled()).toBe(true);
    expect(isStackExchangeSourceEnabled()).toBe(true);
    expect(isAnswerEnginePageFetchEnabled()).toBe(true);
  });

  test("defaults each flag off and only accepts the exact true value", () => {
    expect(isAgentModelRoutingEnabled()).toBe(false);
    expect(isAgentPromptCacheEnabled()).toBe(false);
    expect(isAgentCostTrackingEnabled()).toBe(false);
    expect(isAgentDiagnosticSourcesEnabled()).toBe(false);
    expect(isAgentUserStepsEnabled()).toBe(false);

    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AGENT_PROMPT_CACHE_ENABLED", "TRUE");
    vi.stubEnv("HELP_DESK_AGENT_COST_TRACKING_ENABLED", "1");
    vi.stubEnv("HELP_DESK_AGENT_DIAGNOSTIC_SOURCES_ENABLED", "TRUE");
    vi.stubEnv("HELP_DESK_AGENT_USER_STEPS_ENABLED", "TRUE");

    expect(isAgentModelRoutingEnabled()).toBe(true);
    expect(isAgentPromptCacheEnabled()).toBe(false);
    expect(isAgentCostTrackingEnabled()).toBe(false);
    expect(isAgentDiagnosticSourcesEnabled()).toBe(false);
    expect(isAgentUserStepsEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_AGENT_DIAGNOSTIC_SOURCES_ENABLED", "true");
    expect(isAgentDiagnosticSourcesEnabled()).toBe(true);
    vi.stubEnv("HELP_DESK_AGENT_USER_STEPS_ENABLED", "true");
    expect(isAgentUserStepsEnabled()).toBe(true);
  });

  test("keeps abandonment sweep disabled by default and clamps its age", () => {
    expect(isAgentAbandonSweepEnabled()).toBe(false);
    expect(getAgentAbandonMinutes()).toBe(60);

    vi.stubEnv("HELP_DESK_AGENT_ABANDON_SWEEP_ENABLED", "TRUE");
    expect(isAgentAbandonSweepEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_AGENT_ABANDON_SWEEP_ENABLED", "true");
    expect(isAgentAbandonSweepEnabled()).toBe(true);

    vi.stubEnv("HELP_DESK_AGENT_ABANDON_MINUTES", "14");
    expect(getAgentAbandonMinutes()).toBe(15);
    vi.stubEnv("HELP_DESK_AGENT_ABANDON_MINUTES", "2000");
    expect(getAgentAbandonMinutes()).toBe(1440);
    vi.stubEnv("HELP_DESK_AGENT_ABANDON_MINUTES", "invalid");
    expect(getAgentAbandonMinutes()).toBe(60);
  });

  test("keeps identity assurance disabled by default and clamps freshness", () => {
    expect(isIdentityAssuranceEnabled()).toBe(false);
    expect(getIdentityAssuranceFreshMinutes()).toBe(10);

    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "TRUE");
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_FRESH_MINUTES", "0");
    expect(isIdentityAssuranceEnabled()).toBe(false);
    expect(getIdentityAssuranceFreshMinutes()).toBe(1);

    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "true");
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_FRESH_MINUTES", "120");
    expect(isIdentityAssuranceEnabled()).toBe(true);
    expect(getIdentityAssuranceFreshMinutes()).toBe(60);
  });
});
