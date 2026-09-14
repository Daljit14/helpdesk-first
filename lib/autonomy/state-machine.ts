export const RUN_STATUSES = [
  "queued",
  "investigating",
  "planning",
  "policy_check",
  "awaiting_consent",
  "awaiting_approval",
  "executing",
  "verifying",
  "verified",
  "resolved",
  "rolling_back",
  "escalated",
  "failed",
  "paused",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

const terminalStatuses = new Set<RunStatus>(["resolved", "escalated"]);
const resumableStatuses = RUN_STATUSES.filter(
  (status): status is RunStatus =>
    status !== "resolved" && status !== "escalated" && status !== "paused"
);

export const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["investigating", "escalated", "paused"],
  investigating: ["planning", "escalated", "paused"],
  planning: ["policy_check", "escalated", "paused"],
  policy_check: [
    "awaiting_consent",
    "awaiting_approval",
    "executing",
    "escalated",
    "paused",
  ],
  awaiting_consent: ["executing", "escalated", "paused"],
  awaiting_approval: ["executing", "escalated", "paused"],
  executing: ["verifying", "failed", "escalated", "paused"],
  verifying: ["verified", "rolling_back", "failed", "escalated", "paused"],
  verified: ["resolved", "escalated", "paused"],
  resolved: [],
  rolling_back: ["escalated", "failed", "paused"],
  escalated: [],
  failed: ["escalated", "queued", "paused"],
  paused: [...resumableStatuses, "escalated"],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: RunStatus,
    public readonly to: RunStatus
  ) {
    super(`Illegal autonomy transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export function isTerminal(status: RunStatus): boolean {
  return terminalStatuses.has(status);
}
