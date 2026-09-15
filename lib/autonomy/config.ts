export type AutonomyMode = "shadow" | "execute";
export type PlannerMode = "shadow" | "execute";

function boundedNumber(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), minimum), maximum);
}

export function isAutonomyEnabled(): boolean {
  return process.env.HELP_DESK_AUTONOMY_ENABLED === "true";
}

export function isAutonomousExecutionEnabled(): boolean {
  return process.env.HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED === "true";
}

export function guardrailsEnforced(): boolean {
  return process.env.HELP_DESK_GUARDRAILS_ENFORCED !== "false";
}

export function isPolicyEngineEnabled(): boolean {
  return process.env.HELP_DESK_POLICY_ENGINE_ENABLED === "true";
}

export function isPlannerEnabled(): boolean {
  return process.env.HELP_DESK_PLANNER_ENABLED === "true";
}

export function isVerificationEngineEnabled(): boolean {
  return process.env.HELP_DESK_VERIFICATION_ENGINE_ENABLED === "true";
}

export function isRollbackEnabled(): boolean {
  return process.env.HELP_DESK_ROLLBACK_ENABLED === "true";
}

export function isAutonomyAlertsEnabled(): boolean {
  return process.env.HELP_DESK_AUTONOMY_ALERTS_ENABLED === "true";
}

export function isShadowModeEnabled(): boolean {
  return process.env.HELP_DESK_SHADOW_MODE_ENABLED === "true";
}

export function isCapabilityDisabledByEnv(capabilityId: string): boolean {
  const key = `HELP_DESK_CAP_${capabilityId.toUpperCase()}_ENABLED`;
  return process.env[key] === "false";
}

export function isProviderDisabledByEnv(provider: string): boolean {
  return (
    process.env[`HELP_DESK_PROVIDER_${provider.toUpperCase()}_ENABLED`] ===
    "false"
  );
}

export function getPlannerMode(): PlannerMode {
  return process.env.HELP_DESK_PLANNER_MODE === "execute"
    ? "execute"
    : "shadow";
}

export function getPlannerProvider(): string {
  return process.env.HELP_DESK_PLANNER_PROVIDER?.trim() || "deterministic";
}

export function getAutonomyMode(): AutonomyMode {
  return process.env.HELP_DESK_AUTONOMY_MODE === "execute"
    ? "execute"
    : "shadow";
}

export function getAutonomyLimits() {
  return {
    maxAttempts: boundedNumber("HELP_DESK_AUTONOMY_MAX_ATTEMPTS", 3, 1, 5),
    budgetCents: boundedNumber(
      "HELP_DESK_AUTONOMY_BUDGET_CENTS",
      50,
      0,
      1_000_000
    ),
    runtimeMs: boundedNumber(
      "HELP_DESK_AUTONOMY_RUNTIME_MS",
      15 * 60_000,
      1_000,
      60 * 60_000
    ),
    leaseMs: boundedNumber(
      "HELP_DESK_AUTONOMY_LEASE_MS",
      5 * 60_000,
      1_000,
      60 * 60_000
    ),
    breakerThreshold: boundedNumber(
      "HELP_DESK_AUTONOMY_BREAKER_THRESHOLD",
      3,
      1,
      100
    ),
    breakerWindowMs: boundedNumber(
      "HELP_DESK_AUTONOMY_BREAKER_WINDOW_MS",
      15 * 60_000,
      1_000,
      24 * 60 * 60_000
    ),
    breakerCooldownMs: boundedNumber(
      "HELP_DESK_AUTONOMY_BREAKER_COOLDOWN_MS",
      30 * 60_000,
      1_000,
      24 * 60 * 60_000
    ),
    maxConcurrentPerOrg: boundedNumber(
      "HELP_DESK_AUTONOMY_MAX_CONCURRENT_PER_ORG",
      2,
      1,
      20
    ),
    maxRunsPerUserPerDay: boundedNumber(
      "HELP_DESK_AUTONOMY_MAX_RUNS_PER_USER_PER_DAY",
      5,
      1,
      100
    ),
    maxRunsPerOrgPerDay: boundedNumber(
      "HELP_DESK_AUTONOMY_MAX_RUNS_PER_ORG_PER_DAY",
      50,
      1,
      5_000
    ),
    maxPlannerInputChars: boundedNumber(
      "HELP_DESK_AUTONOMY_MAX_PLANNER_INPUT_CHARS",
      8_000,
      1_000,
      50_000
    ),
    maxProviderCallsPerRun: boundedNumber(
      "HELP_DESK_AUTONOMY_MAX_PROVIDER_CALLS_PER_RUN",
      3,
      1,
      10
    ),
  };
}
