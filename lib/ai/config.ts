export type AiProviderKind = "mock" | "anthropic" | "shadow";

export function getAiProviderKind(): AiProviderKind {
  const value = process.env.HELP_DESK_AI_PROVIDER;
  return value === "anthropic" || value === "shadow" || value === "mock"
    ? value
    : "mock";
}

export function getAiModel(): string {
  return process.env.HELP_DESK_AI_MODEL?.trim() || "claude-3-5-haiku-20241022";
}

export function getDailyCallBudget(): number {
  const value = Number.parseInt(
    process.env.HELP_DESK_AI_DAILY_CALL_BUDGET ?? "500",
    10
  );
  return Number.isFinite(value) && value >= 0 ? value : 500;
}
