export type AiProviderKind = "mock" | "anthropic" | "shadow";

export function getAiProviderKind(): AiProviderKind {
  const value = process.env.HELP_DESK_AI_PROVIDER;
  return value === "anthropic" || value === "shadow" || value === "mock"
    ? value
    : "mock";
}

export function getAiModel(): string {
  return process.env.HELP_DESK_AI_MODEL?.trim() || "claude-haiku-4-5-20251001";
}

export function getAgentPlannerModel(): string | null {
  return process.env.HELP_DESK_AGENT_PLANNER_MODEL?.trim() || null;
}

export function getOrgDailyCostCapMicros(): number {
  const fallback = 10_000_000;
  const configured = process.env.HELP_DESK_AI_ORG_DAILY_COST_CAP_USD;
  const dollars = configured?.trim() ? Number(configured) : 10;
  if (!Number.isFinite(dollars) || dollars < 0) return fallback;
  const micros = Math.round(dollars * 1_000_000);
  return Number.isFinite(micros) ? micros : fallback;
}

export function getDailyCallBudget(): number {
  const value = Number.parseInt(
    process.env.HELP_DESK_AI_DAILY_CALL_BUDGET ?? "500",
    10
  );
  return Number.isFinite(value) && value >= 0 ? value : 500;
}
