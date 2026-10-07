import { afterEach, describe, expect, test, vi } from "vitest";
import {
  isAgentDiagnosticSourcesEnabled,
  isAgentUserStepsEnabled,
  isAgentCostTrackingEnabled,
  isAgentStyleV2Enabled,
  isAgentModelRoutingEnabled,
  isAgentPromptCacheEnabled,
  isAnswerEngineEnabled,
  isAnswerEnginePublicEnabled,
  isAnswerEnginePageFetchEnabled,
  isAssistantChatEnabled,
  isStackExchangeSourceEnabled,
  isWikipediaSourceEnabled,
  getAgentAbandonMinutes,
  isAgentAbandonSweepEnabled,
  getIdentityAssuranceFreshMinutes,
  isIdentityAssuranceEnabled,
  isIdentityRiskSignalsEnabled,
  isStaffVerificationEnabled,
  isDeviceSignedTrustEnabled,
  isOrgActionPolicyEnabled,
} from "./flags";

afterEach(() => vi.unstubAllEnvs());

describe("requester agent flags", () => {
  test("keeps assistant chat disabled unless exactly enabled", () => {
    expect(isAssistantChatEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_ASSISTANT_CHAT_ENABLED", "TRUE");
    expect(isAssistantChatEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_ASSISTANT_CHAT_ENABLED", "true");
    expect(isAssistantChatEnabled()).toBe(true);
  });

  test("keeps organization action policy disabled unless exactly enabled", () => {
    expect(isOrgActionPolicyEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_ORG_ACTION_POLICY_ENABLED", "TRUE");
    expect(isOrgActionPolicyEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_ORG_ACTION_POLICY_ENABLED", "true");
    expect(isOrgActionPolicyEnabled()).toBe(true);
  });

  test("keeps device-signed trust disabled unless explicitly enabled", () => {
    expect(isDeviceSignedTrustEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_DEVICE_SIGNED_TRUST_ENABLED", "TRUE");
    expect(isDeviceSignedTrustEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_DEVICE_SIGNED_TRUST_ENABLED", "true");
    expect(isDeviceSignedTrustEnabled()).toBe(true);
  });

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
    expect(isAgentStyleV2Enabled()).toBe(false);

    vi.stubEnv("HELP_DESK_AGENT_MODEL_ROUTING_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AGENT_PROMPT_CACHE_ENABLED", "TRUE");
    vi.stubEnv("HELP_DESK_AGENT_COST_TRACKING_ENABLED", "1");
    vi.stubEnv("HELP_DESK_AGENT_DIAGNOSTIC_SOURCES_ENABLED", "TRUE");
    vi.stubEnv("HELP_DESK_AGENT_USER_STEPS_ENABLED", "TRUE");
    vi.stubEnv("HELP_DESK_AGENT_STYLE_V2_ENABLED", "TRUE");

    expect(isAgentModelRoutingEnabled()).toBe(true);
    expect(isAgentPromptCacheEnabled()).toBe(false);
    expect(isAgentCostTrackingEnabled()).toBe(false);
    expect(isAgentDiagnosticSourcesEnabled()).toBe(false);
    expect(isAgentUserStepsEnabled()).toBe(false);
    expect(isAgentStyleV2Enabled()).toBe(false);
    vi.stubEnv("HELP_DESK_AGENT_DIAGNOSTIC_SOURCES_ENABLED", "true");
    expect(isAgentDiagnosticSourcesEnabled()).toBe(true);
    vi.stubEnv("HELP_DESK_AGENT_USER_STEPS_ENABLED", "true");
    expect(isAgentUserStepsEnabled()).toBe(true);
    vi.stubEnv("HELP_DESK_AGENT_STYLE_V2_ENABLED", "true");
    expect(isAgentStyleV2Enabled()).toBe(true);
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

  test("gates risk signals and staff verification behind identity assurance", () => {
    expect(isIdentityRiskSignalsEnabled()).toBe(false);
    expect(isStaffVerificationEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_IDENTITY_RISK_SIGNALS_ENABLED", "true");
    vi.stubEnv("HELP_DESK_STAFF_VERIFICATION_ENABLED", "true");
    expect(isIdentityRiskSignalsEnabled()).toBe(false);
    expect(isStaffVerificationEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_IDENTITY_ASSURANCE_ENABLED", "true");
    expect(isIdentityRiskSignalsEnabled()).toBe(true);
    expect(isStaffVerificationEnabled()).toBe(true);
  });
});
