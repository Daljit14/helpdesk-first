import type { ResearchProviderId } from "@/lib/research/types";
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

export function getDeviceExecutionOrgAllowlist(): string[] {
  return listFromEnv("HELP_DESK_DEVICE_EXECUTION_ORG_ALLOWLIST");
}

export function getDeviceJobTtlMin(): number {
  return boundedNumber("HELP_DESK_DEVICE_JOB_TTL_MIN", 30, 5, 240);
}

export function guardrailsEnforced(): boolean {
  return process.env.HELP_DESK_GUARDRAILS_ENFORCED !== "false";
}

function listFromEnv(name: string): string[] {
  return [
    ...new Set(
      (process.env[name] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
}

export function getPilotOrgAllowlist(): string[] {
  return listFromEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST");
}

export function getPilotCapabilityAllowlist(): string[] | null {
  if (process.env.HELP_DESK_PILOT_CAPABILITY_ALLOWLIST === undefined)
    return null;
  return listFromEnv("HELP_DESK_PILOT_CAPABILITY_ALLOWLIST");
}

export function getPilotLimits(): { globalDaily: number; orgDaily: number } {
  return {
    globalDaily: boundedNumber(
      "HELP_DESK_AUTONOMY_DAILY_EXECUTION_LIMIT",
      20,
      1,
      10_000
    ),
    orgDaily: boundedNumber(
      "HELP_DESK_PILOT_ORG_DAILY_EXECUTION_LIMIT",
      10,
      1,
      10_000
    ),
  };
}

export function isBlastRadiusEnabled(): boolean {
  return process.env.HELP_DESK_BLAST_RADIUS_ENABLED === "true";
}

export type BlastRadiusLimits = {
  failures: number;
  failureRate: number;
  minRuns: number;
  windowMs: number;
};

export function getBlastRadiusLimits(): BlastRadiusLimits {
  const failureRate = Number.parseFloat(
    process.env.HELP_DESK_BLAST_RADIUS_FAILURE_RATE ?? ""
  );
  return {
    failures: boundedNumber("HELP_DESK_BLAST_RADIUS_FAILURES", 5, 1, 1_000),
    failureRate:
      Number.isFinite(failureRate) && failureRate > 0 && failureRate <= 1
        ? failureRate
        : 0.3,
    minRuns: 5,
    windowMs:
      boundedNumber("HELP_DESK_BLAST_RADIUS_WINDOW_MINUTES", 30, 1, 1_440) *
      60_000,
  };
}

export function getHourlyExecutionLimits(): {
  orgHourly: number | null;
  capabilityDevicesPerHour: number | null;
} {
  const configured = (name: string, fallback: number): number | null => {
    const value = process.env[name];
    return value?.trim()
      ? boundedNumber(name, fallback, 1, 10_000)
      : isBlastRadiusEnabled()
        ? fallback
        : null;
  };
  return {
    orgHourly: configured("HELP_DESK_AUTONOMY_ORG_HOURLY_EXECUTION_LIMIT", 20),
    capabilityDevicesPerHour: configured(
      "HELP_DESK_AUTONOMY_CAPABILITY_DEVICES_PER_HOUR",
      10
    ),
  };
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

export function isCapabilityEnabledByEnv(capabilityId: string): boolean {
  return (
    process.env[`HELP_DESK_CAP_${capabilityId.toUpperCase()}_ENABLED`] ===
    "true"
  );
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

export type ResearchConfig = {
  enabled: boolean;
  provider: ResearchProviderId;
  families: string[];
  minConfidence: number;
  maxQueriesPerRun: number;
  orgDailyBudget: number;
  cacheTtlHours: number;
  judgeEnabled: boolean;
};

export function getResearchConfig(): ResearchConfig {
  const provider =
    process.env.HELP_DESK_RESEARCH_PROVIDER === "brave" ? "brave" : "tavily";
  const families = listFromEnv("HELP_DESK_RESEARCH_FAMILIES");
  const confidence = Number(process.env.HELP_DESK_RESEARCH_MIN_CONFIDENCE);
  return {
    enabled: process.env.HELP_DESK_RESEARCH_ENABLED === "true",
    provider,
    families,
    minConfidence:
      Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
        ? confidence
        : 0.6,
    maxQueriesPerRun: boundedNumber(
      "HELP_DESK_RESEARCH_MAX_QUERIES_PER_RUN",
      3,
      0,
      3
    ),
    orgDailyBudget: boundedNumber(
      "HELP_DESK_RESEARCH_ORG_DAILY_BUDGET",
      50,
      0,
      10_000
    ),
    cacheTtlHours: boundedNumber(
      "HELP_DESK_RESEARCH_CACHE_TTL_HOURS",
      24,
      1,
      720
    ),
    judgeEnabled: process.env.HELP_DESK_JUDGE_ENABLED !== "false",
  };
}

export type AnswerEngineConfig = {
  enabled: boolean;
  publicEnabled: boolean;
  wikipediaEnabled: boolean;
  stackexchangeEnabled: boolean;
  pageFetchEnabled: boolean;
  webProviders: ("brave" | "tavily")[];
  stackexchangeSites: string[];
  stackexchangeKey: string;
  globalDailyCap: number;
  providerTimeoutMs: number;
  deadlineMs: number;
  minConfidence: number;
  cacheTtlHours: number;
  contact: string;
};

export function getAnswerEngineConfig(): AnswerEngineConfig {
  const researchProvider = getResearchConfig().provider;
  const providerFallback: ("brave" | "tavily")[] =
    researchProvider === "brave" ? ["brave", "tavily"] : ["tavily", "brave"];
  const configuredProviders = (
    process.env.HELP_DESK_ANSWER_ENGINE_WEB_PROVIDERS ?? ""
  )
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(
      (provider): provider is "brave" | "tavily" =>
        provider === "brave" || provider === "tavily"
    );
  const webProviders = configuredProviders.length
    ? [...new Set(configuredProviders)]
    : providerFallback;
  const configuredSites = (
    process.env.HELP_DESK_STACKEXCHANGE_SITES ??
    "superuser,serverfault,askubuntu"
  )
    .split(",")
    .map((site) => site.trim().toLowerCase())
    .filter((site) => /^[a-z0-9-]{2,40}$/.test(site));
  const sites = [...new Set(configuredSites)].slice(0, 3);
  const confidence = Number(process.env.HELP_DESK_ANSWER_ENGINE_MIN_CONFIDENCE);
  return {
    enabled: process.env.HELP_DESK_ANSWER_ENGINE_ENABLED === "true",
    publicEnabled:
      process.env.HELP_DESK_ANSWER_ENGINE_PUBLIC_ENABLED === "true",
    wikipediaEnabled: process.env.HELP_DESK_SOURCE_WIKIPEDIA_ENABLED === "true",
    stackexchangeEnabled:
      process.env.HELP_DESK_SOURCE_STACKEXCHANGE_ENABLED === "true",
    pageFetchEnabled: process.env.HELP_DESK_PAGE_FETCH_ENABLED === "true",
    webProviders,
    stackexchangeSites:
      sites.length > 0 ? sites : ["superuser", "serverfault", "askubuntu"],
    stackexchangeKey: process.env.STACKEXCHANGE_KEY?.trim() ?? "",
    globalDailyCap: boundedNumber(
      "HELP_DESK_ANSWER_ENGINE_GLOBAL_DAILY_CAP",
      1000,
      0,
      100_000
    ),
    providerTimeoutMs: boundedNumber(
      "HELP_DESK_ANSWER_ENGINE_PROVIDER_TIMEOUT_MS",
      4000,
      500,
      10_000
    ),
    deadlineMs: boundedNumber(
      "HELP_DESK_ANSWER_ENGINE_DEADLINE_MS",
      10_000,
      2000,
      30_000
    ),
    minConfidence:
      Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
        ? confidence
        : 0.5,
    cacheTtlHours: boundedNumber(
      "HELP_DESK_ANSWER_ENGINE_CACHE_TTL_HOURS",
      24,
      1,
      720
    ),
    contact:
      process.env.HELP_DESK_ANSWER_ENGINE_CONTACT?.trim() ||
      "https://github.com/Daljit14/helpdesk-first",
  };
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
