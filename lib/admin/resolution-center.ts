import type { AdminSession } from "./auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RunStatus } from "@/lib/autonomy/state-machine";

type JsonRecord = Record<string, unknown>;

export type RunSummary = {
  id: string;
  ticketId: string;
  ticketTitle: string;
  ticketStatus: string;
  status: RunStatus;
  attempts: number;
  maxAttempts: number;
  costCents: number;
  budgetCents: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  escalationReason: string | null;
  initiatedBy: string;
  elapsedMs: number;
  plannedCapability: string | null;
  lastPolicyDecision: string | null;
  awaiting: "user_consent" | "technician_approval" | null;
  reopened: boolean;
};

export type ResolutionMetrics = {
  aiAssigned: number;
  autoResolved: number;
  userAssisted: number;
  escalated: number;
  verificationFailures: number;
  rollbacks: number;
  reopenRate: number;
  falseResolutionRate: number;
  medianTimeToVerifiedMs: number;
  costPerVerifiedCents: number;
  byCapability: {
    capabilityId: string;
    platform: string | null;
    executed: number;
    verified: number;
  }[];
};

export type RunDetail = RunSummary & {
  steps: unknown[];
  events: unknown[];
  policyDecisions: unknown[];
  executions: unknown[];
  verifications: unknown[];
  rollbacks: unknown[];
  approvals: unknown[];
  diagnosis: unknown | null;
  evidenceSummary: unknown | null;
};

type RawRun = {
  id: string;
  organization_id: string;
  ticket_id: string;
  status: RunStatus;
  attempts: number;
  max_attempts: number;
  cost_cents: number;
  budget_cents: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  escalation_reason: string | null;
  initiated_by: string;
};

type RawTicket = {
  id: string;
  issue_title: string | null;
  status: string | null;
  platform?: string | null;
  escalation_package?: unknown;
};

type RawApproval = {
  run_id: string;
  type: "user_consent" | "technician_approval";
  status: string;
};

type RawExecution = {
  id: string;
  run_id: string;
  capability_id: string;
  capability_version: number;
  status: string;
  parameters?: unknown;
  result?: unknown;
  duration_ms?: number | null;
  cost_cents?: number;
  created_at?: string;
};

type RawVerification = {
  run_id: string;
  execution_id: string | null;
  outcome: string;
  user_confirmed: boolean;
};

function elapsedMs(run: RawRun, now = Date.now()): number {
  const end = run.completed_at ? new Date(run.completed_at).getTime() : now;
  return Math.max(0, end - new Date(run.created_at).getTime());
}

function capabilityFromSteps(steps: JsonRecord[]): string | null {
  const plan = [...steps]
    .reverse()
    .find((step) => step.kind === "plan")?.detail;
  if (!plan || typeof plan !== "object") return null;
  const value = (plan as JsonRecord).plan;
  if (!value || typeof value !== "object") return null;
  const stepsValue = (value as JsonRecord).steps;
  if (!Array.isArray(stepsValue) || !stepsValue[0]) return null;
  const first = stepsValue[0];
  if (typeof first !== "object" || first === null) return null;
  const capabilityId = (first as JsonRecord).capabilityId;
  return typeof capabilityId === "string" ? capabilityId : null;
}

function policyFromRows(rows: JsonRecord[]): string | null {
  const value = rows.at(-1)?.decision;
  return typeof value === "string" ? value : null;
}

function awaitingFromRows(
  run: RawRun,
  approvals: RawApproval[]
): "user_consent" | "technician_approval" | null {
  const requested = approvals.find(
    (approval) => approval.run_id === run.id && approval.status === "requested"
  );
  if (requested) return requested.type;
  if (run.status === "awaiting_consent") return "user_consent";
  if (run.status === "awaiting_approval") return "technician_approval";
  return null;
}

function summary(
  run: RawRun,
  ticket: RawTicket | undefined,
  steps: JsonRecord[],
  policies: JsonRecord[],
  approvals: RawApproval[],
  reopened: boolean
): RunSummary {
  return {
    id: run.id,
    ticketId: run.ticket_id,
    ticketTitle: ticket?.issue_title ?? "Untitled ticket",
    ticketStatus: ticket?.status ?? "Unknown",
    status: run.status,
    attempts: run.attempts,
    maxAttempts: run.max_attempts,
    costCents: run.cost_cents,
    budgetCents: run.budget_cents,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    completedAt: run.completed_at,
    escalationReason: run.escalation_reason,
    initiatedBy: run.initiated_by,
    elapsedMs: elapsedMs(run),
    plannedCapability: capabilityFromSteps(steps),
    lastPolicyDecision: policyFromRows(policies),
    awaiting: awaitingFromRows(run, approvals),
    reopened,
  };
}

export function computeResolutionMetrics(
  runs: RunSummary[],
  executions: {
    runId: string;
    executionId: string;
    capabilityId: string;
    platform: string | null;
    status: string;
    costCents?: number;
  }[],
  verifications: {
    runId: string;
    executionId: string | null;
    outcome: string;
    userConfirmed: boolean;
  }[],
  rollbacks: { runId: string }[],
  ticketsReopened: string[]
): ResolutionMetrics {
  const resolved = runs.filter((run) => run.status === "resolved");
  const executionByRun = new Map<string, typeof executions>();
  for (const execution of executions) {
    const existing = executionByRun.get(execution.runId) ?? [];
    existing.push(execution);
    executionByRun.set(execution.runId, existing);
  }
  const autoResolved = resolved.filter((run) =>
    (executionByRun.get(run.id) ?? []).some(
      (execution) => execution.status === "succeeded"
    )
  ).length;
  const userAssisted = resolved.filter((run) => {
    const runExecutions = executionByRun.get(run.id) ?? [];
    return (
      runExecutions.length === 0 ||
      verifications.some(
        (verification) =>
          verification.runId === run.id &&
          verification.userConfirmed &&
          runExecutions.length === 0
      )
    );
  }).length;
  const reopened = resolved.filter((run) =>
    ticketsReopened.includes(run.ticketId)
  ).length;
  const durations = resolved
    .map((run) => run.elapsedMs)
    .sort((left, right) => left - right);
  const median =
    durations.length === 0
      ? 0
      : durations.length % 2 === 1
        ? durations[Math.floor(durations.length / 2)]
        : (durations[durations.length / 2 - 1] +
            durations[durations.length / 2]) /
          2;
  const capabilityMap = new Map<
    string,
    {
      capabilityId: string;
      platform: string | null;
      executed: number;
      verified: number;
    }
  >();
  for (const execution of executions) {
    const key = `${execution.capabilityId}:${execution.platform ?? ""}`;
    const value = capabilityMap.get(key) ?? {
      capabilityId: execution.capabilityId,
      platform: execution.platform,
      executed: 0,
      verified: 0,
    };
    value.executed += 1;
    if (
      verifications.some(
        (verification) =>
          verification.executionId === execution.executionId &&
          verification.outcome === "passed"
      )
    ) {
      value.verified += 1;
    }
    capabilityMap.set(key, value);
  }
  return {
    aiAssigned: runs.length,
    autoResolved,
    userAssisted,
    escalated: runs.filter((run) => run.status === "escalated").length,
    verificationFailures: verifications.filter(
      (verification) => verification.outcome === "failed"
    ).length,
    rollbacks: rollbacks.length,
    reopenRate: resolved.length ? reopened / resolved.length : 0,
    falseResolutionRate: resolved.length ? reopened / resolved.length : 0,
    medianTimeToVerifiedMs: median,
    costPerVerifiedCents: resolved.length
      ? resolved.reduce((sum, run) => sum + run.costCents, 0) / resolved.length
      : 0,
    byCapability: [...capabilityMap.values()],
  };
}

async function queryRows(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  organizationId: string,
  runIds?: string[]
): Promise<JsonRecord[]> {
  let query = admin
    .from(table)
    .select("*")
    .eq("organization_id", organizationId);
  if (runIds) query = query.in("run_id", runIds);
  const result = await query;
  return (result.data ?? []) as JsonRecord[];
}

export async function getResolutionCenterOverview(
  session: AdminSession,
  opts: { windowDays?: number } = {}
): Promise<{ runs: RunSummary[]; metrics: ResolutionMetrics }> {
  const admin = createAdminClient();
  const windowDays = opts.windowDays ?? 30;
  const start = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const runResult = await admin
    .from("resolution_runs")
    .select("*")
    .eq("organization_id", session.organizationId)
    .gte("created_at", start)
    .order("created_at", { ascending: false });
  const rawRuns = (runResult.data ?? []) as RawRun[];
  const runIds = rawRuns.map((run) => run.id);
  const ticketIds = rawRuns.map((run) => run.ticket_id);
  const [
    ticketResult,
    steps,
    policies,
    approvals,
    executions,
    verifications,
    rollbacks,
  ] = await Promise.all([
    ticketIds.length
      ? admin
          .from("tickets")
          .select("id,issue_title,status,platform")
          .eq("organization_id", session.organizationId)
          .in("id", ticketIds)
      : Promise.resolve({ data: [], error: null }),
    queryRows(admin, "resolution_steps", session.organizationId, runIds),
    queryRows(admin, "policy_decisions", session.organizationId, runIds),
    queryRows(admin, "approval_requests", session.organizationId, runIds),
    queryRows(admin, "capability_executions", session.organizationId, runIds),
    queryRows(admin, "verification_results", session.organizationId, runIds),
    queryRows(admin, "rollback_runs", session.organizationId, runIds),
  ]);
  const tickets = (ticketResult.data ?? []) as RawTicket[];
  const stepRows = steps;
  const policyRows = policies;
  const approvalRows = approvals as unknown as RawApproval[];
  const summaries = rawRuns.map((run) =>
    summary(
      run,
      tickets.find((ticket) => ticket.id === run.ticket_id),
      stepRows.filter((step) => step.run_id === run.id),
      policyRows.filter((policy) => policy.run_id === run.id),
      approvalRows,
      tickets.find(
        (ticket) => ticket.id === run.ticket_id && ticket.status === "Reopened"
      ) !== undefined
    )
  );
  const executionRows = executions as unknown as RawExecution[];
  const verificationRows = verifications as unknown as RawVerification[];
  const metrics = computeResolutionMetrics(
    summaries,
    executionRows.map((execution) => ({
      runId: execution.run_id,
      executionId: execution.id,
      capabilityId: execution.capability_id,
      platform:
        tickets.find(
          (ticket) =>
            ticket.id ===
            rawRuns.find((run) => run.id === execution.run_id)?.ticket_id
        )?.platform ?? null,
      status: execution.status,
      costCents: execution.cost_cents,
    })),
    verificationRows.map((verification) => ({
      runId: verification.run_id,
      executionId: verification.execution_id,
      outcome: verification.outcome,
      userConfirmed: verification.user_confirmed,
    })),
    rollbacks.map((rollback) => ({ runId: String(rollback.run_id) })),
    tickets
      .filter((ticket) => ticket.status === "Reopened")
      .map((ticket) => ticket.id)
  );
  return { runs: summaries, metrics };
}

export async function getResolutionRunDetail(
  session: AdminSession,
  runId: string
): Promise<RunDetail | null> {
  const admin = createAdminClient();
  const runResult = await admin
    .from("resolution_runs")
    .select("*")
    .eq("organization_id", session.organizationId)
    .eq("id", runId)
    .maybeSingle();
  const run = runResult.data as RawRun | null;
  if (!run) return null;
  const [
    ticketResult,
    steps,
    events,
    policies,
    executions,
    verifications,
    rollbacks,
    approvals,
  ] = await Promise.all([
    admin
      .from("tickets")
      .select("id,issue_title,status,escalation_package")
      .eq("organization_id", session.organizationId)
      .eq("id", run.ticket_id)
      .maybeSingle(),
    queryRows(admin, "resolution_steps", session.organizationId, [run.id]),
    queryRows(admin, "resolution_events", session.organizationId, [run.id]),
    queryRows(admin, "policy_decisions", session.organizationId, [run.id]),
    queryRows(admin, "capability_executions", session.organizationId, [run.id]),
    queryRows(admin, "verification_results", session.organizationId, [run.id]),
    queryRows(admin, "rollback_runs", session.organizationId, [run.id]),
    queryRows(admin, "approval_requests", session.organizationId, [run.id]),
  ]);
  const ticket = ticketResult.data as RawTicket | null;
  const policyRows = policies;
  const runSummary = summary(
    run,
    ticket ?? undefined,
    steps,
    policyRows,
    approvals as unknown as RawApproval[],
    ticket?.status === "Reopened"
  );
  return {
    ...runSummary,
    steps,
    events,
    policyDecisions: policies,
    executions,
    verifications,
    rollbacks,
    approvals,
    diagnosis: ticket?.escalation_package ?? null,
    evidenceSummary:
      events.find((event) => event.kind === "evidence.snapshot")?.detail ??
      null,
  };
}
