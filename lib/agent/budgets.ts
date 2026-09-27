function bounded(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value)
    ? Math.max(0, Math.min(Math.floor(value), max))
    : fallback;
}

export function getRequesterAgentBudgets() {
  return {
    maxToolCalls: bounded("HELP_DESK_REQUESTER_AGENT_MAX_TOOL_CALLS", 25, 100),
    maxModelTurns: bounded(
      "HELP_DESK_REQUESTER_AGENT_MAX_MODEL_TURNS",
      15,
      100
    ),
    maxActions: bounded("HELP_DESK_REQUESTER_AGENT_MAX_ACTIONS", 5, 100),
    maxTokens: bounded(
      "HELP_DESK_REQUESTER_AGENT_MAX_TOKENS_PER_SESSION",
      60_000,
      500_000
    ),
    maxMinutes: bounded(
      "HELP_DESK_REQUESTER_AGENT_MAX_SESSION_MINUTES",
      30,
      240
    ),
  };
}

export function getRequesterAgentUserDailyActionCap(): number {
  const value = Number(
    process.env.HELP_DESK_REQUESTER_AGENT_USER_DAILY_ACTIONS
  );
  return Number.isFinite(value)
    ? Math.max(0, Math.min(Math.floor(value), 100))
    : 10;
}

export function getRequesterAgentMaxFailedHypotheses(): number {
  const value = Number(
    process.env.HELP_DESK_REQUESTER_AGENT_MAX_FAILED_HYPOTHESES
  );
  return Number.isFinite(value)
    ? Math.max(1, Math.min(Math.floor(value), 10))
    : 3;
}

export function budgetExceeded(session: {
  tool_call_count: number;
  model_turn_count: number;
  action_count: number;
  token_count: number;
  started_at: string;
}): string | null {
  const limits = getRequesterAgentBudgets();
  if (session.tool_call_count >= limits.maxToolCalls) return "tool_calls";
  if (session.model_turn_count >= limits.maxModelTurns) return "model_turns";
  if (session.action_count >= limits.maxActions) return "actions";
  if (session.token_count >= limits.maxTokens) return "tokens";
  if (Date.now() - Date.parse(session.started_at) >= limits.maxMinutes * 60_000)
    return "minutes";
  return null;
}
