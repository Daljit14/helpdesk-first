import { afterEach, describe, expect, test, vi } from "vitest";
import { assertGuardrailsEnforced } from "./enforce";

describe("guardrail configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("throws only when autonomous execution is enabled and enforcement is false", () => {
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "false");
    expect(() => assertGuardrailsEnforced()).toThrow();
  });

  test("does not throw when execution is disabled or enforcement is true", () => {
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "false");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "false");
    expect(() => assertGuardrailsEnforced()).not.toThrow();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    expect(() => assertGuardrailsEnforced()).not.toThrow();
  });
});
