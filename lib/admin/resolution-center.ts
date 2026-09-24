import type { AdminSession } from "./auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RunStatus } from "@/lib/autonomy/state-machine";
import { getPilotLimits } from "@/lib/autonomy/config";
import type { Judgement, TrustTier } from "@/lib/research/types";
import { getDeviceShadowActivity } from "./device-shadow";
import { getExcludedRecordIds, withoutExcluded } from "./record-exclusions";

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
  researchSources: JudgedSourceRow[];
  deviceJobs: unknown[];
};

export type JudgedSourceRow = {
  url: string;
  domain: string;
  title: string;
  trust: TrustTier;
  judgement: Judgement;
  snippet?: string;
  query?: string;
};

export type ShadowDecision = {
  id: string;
  organizationId: string;
  runId: string;
  ticketId: string;
  plan: unknown;
  planner: string;
  plannerVersion: string;
  plannerProvider: string;
  policyDecision: string | null;
  policyReasons: string[];
  capabilityId: string | null;
  capabilityVersion: number | null;
  inputBlocked: boolean;
  outputRejected: boolean;
  rejectionReason: string | null;
  versions: unknown;
  latencyMs: number | null;
  costCents: number;
  reviewStatus: "unreviewed" | "agree" | "disagree" | "unsafe";
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type ShadowMetrics = {
  total: number;
  agreementRate: number;
  unsafePlanRate: number;
  falseAllowRate: number;
  plannerLatencyMs: number;
  plannerCostCents: number;
};

export type PilotReview = {
  id: string;
  organizationId: string;
  runId: string;
  ticketId: string;
  capabilityId: string | null;
  capabilityVersion: number | null;
  resolvedAt: string;
  reviewStatus: "pending" | "confirmed" | "incorrect" | "unsafe";
  reviewSource: "admin" | "reopen";
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

function shadowRow(row: Record<string, unknown>): ShadowDecision {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    runId: String(row.run_id),
    ticketId: String(row.ticket_id),
    plan: row.plan,
    planner: String(row.planner),
    plannerVersion: String(row.planner_version),
    plannerProvider: String(row.planner_provider),
    policyDecision:
      typeof row.policy_decision === "string" ? row.policy_decision : null,
    policyReasons: Array.isArray(row.policy_reasons)
      ? row.policy_reasons.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    capabilityId:
      typeof row.would_execute_capability_id === "string"
        ? row.would_execute_capability_id
        : null,
    capabilityVersion:
      typeof row.would_execute_capability_version === "number"
        ? row.would_execute_capability_version
        : null,
    inputBlocked: row.input_blocked === true,
    outputRejected: row.output_rejected === true,
    rejectionReason:
      typeof row.rejection_reason === "string" ? row.rejection_reason : null,
    versions: row.versions,
    latencyMs: typeof row.latency_ms === "number" ? row.latency_ms : null,
    costCents: typeof row.cost_cents === "number" ? row.cost_cents : 0,
    reviewStatus:
      row.review_status === "agree" ||
      row.review_status === "disagree" ||
      row.review_status === "unsafe"
        ? row.review_status
        : "unreviewed",
    reviewedBy: typeof row.reviewed_by === "string" ? row.reviewed_by : null,
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    reviewNote: typeof row.review_note === "string" ? row.review_note : null,
    createdAt: String(row.created_at),
  };
}

export function shadowMetrics(rows: ShadowDecision[]): ShadowMetrics {
  const reviewed = rows.filter((row) => row.reviewStatus !== "unreviewed");
  const agreed = reviewed.filter((row) => row.reviewStatus === "agree").length;
  return {
    total: rows.length,
    agreementRate: reviewed.length ? agreed / reviewed.length : 0,
    unsafePlanRate: rows.length
      ? rows.filter((row) => row.reviewStatus === "unsafe").length / rows.length
      : 0,
    falseAllowRate: rows.length
      ? rows.filter(
          (row) =>
            row.reviewStatus === "disagree" &&
            row.policyDecision === "allow_automatic"
        ).length / rows.length
      : 0,
    plannerLatencyMs: rows.length
      ? rows.reduce((sum, row) => sum + (row.latencyMs ?? 0), 0) / rows.length
      : 0,
    plannerCostCents: rows.length
      ? rows.reduce((sum, row) => sum + row.costCents, 0) / rows.length
      : 0,
  };
}

export async function listShadowDecisions(
  admin: ReturnType<typeof createAdminClient>,
  session: AdminSession,
  options: { status?: ShadowDecision["reviewStatus"]; limit?: number } = {}
): Promise<ShadowDecision[]> {
  let query = admin
    .from("shadow_decisions")
    .select("*")
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 500));
  if (options.status) query = query.eq("review_status", options.status);
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as Record<string, unknown>[]).map(shadowRow);
}

export async function getShadowOverview(
  session: AdminSession,
  options: { status?: ShadowDecision["reviewStatus"]; windowDays?: number } = {}
): Promise<{
  decisions: ShadowDecision[];
  metrics: ShadowMetrics;
  error: string | null;
}> {
  const admin = createAdminClient();
  const windowDays = Math.max(1, options.windowDays ?? 30);
  let query = admin
    .from("shadow_decisions")
    .select("*")
    .eq("organization_id", session.organizationId)
    .gte(
      "created_at",
      new Date(Date.now() - windowDays * 86_400_000).toISOString()
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (options.status) query = query.eq("review_status", options.status);
  const result = await query;
  if (result.error) {
    return {
      decisions: [],
      metrics: shadowMetrics([]),
      error: result.error.message,
    };
  }
  const decisions = ((result.data ?? []) as Record<string, unknown>[]).map(
    shadowRow
  );
  return { decisions, metrics: shadowMetrics(decisions), error: null };
}

export async function getShadowAggregate(session: AdminSession): Promise<{
  total: number;
  reviewed: number;
  unsafe: number;
}> {
  if (!session.isPlatformAdmin)
    throw new Error("Platform admin access required.");
  const result = await createAdminClient()
    .from("shadow_decisions")
    .select("review_status");
  const rows = (result.data ?? []) as { review_status?: string }[];
  return {
    total: rows.length,
    reviewed: rows.filter((row) => row.review_status !== "unreviewed").length,
    unsafe: rows.filter((row) => row.review_status === "unsafe").length,
  };
}

function pilotReview(row: Record<string, unknown>): PilotReview {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    runId: String(row.run_id),
    ticketId: String(row.ticket_id),
    capabilityId:
      typeof row.capability_id === "string" ? row.capability_id : null,
    capabilityVersion:
      typeof row.capability_version === "number"
        ? row.capability_version
        : null,
    resolvedAt: String(row.resolved_at),
    reviewStatus:
      row.review_status === "confirmed" ||
      row.review_status === "incorrect" ||
      row.review_status === "unsafe"
        ? row.review_status
        : "pending",
    reviewSource: row.review_source === "reopen" ? "reopen" : "admin",
    reviewedBy: typeof row.reviewed_by === "string" ? row.reviewed_by : null,
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    reviewNote: typeof row.review_note === "string" ? row.review_note : null,
  };
}

export async function getPilotOverview(session: AdminSession): Promise<{
  paused: boolean;
  pauseReason: string | null;
  executionsToday: number;
  limits: { globalDaily: number; orgDaily: number };
  verificationPassRate: number;
  reopenRate: number;
  reviews: PilotReview[];
  reviewCounts: Record<PilotReview["reviewStatus"], number>;
  perCapability: { id: string; count: number }[];
  deviceJobs: {
    total: number;
    real: number;
    shadow: number;
    executed: number;
  };
  error: string | null;
}> {
  const admin = createAdminClient();
  const start = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    )
  ).toISOString();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  try {
    const [switchResult, executions, reviewsResult, verifications, deviceJobs] =
      await Promise.all([
        admin
          .from("ai_kill_switches")
          .select("enabled,reason")
          .eq("scope", "organization")
          .eq("scope_id", session.organizationId)
          .eq("organization_id", session.organizationId)
          .maybeSingle(),
        admin
          .from("capability_executions")
          .select("capability_id")
          .eq("organization_id", session.organizationId)
          .gte("created_at", start),
        admin
          .from("pilot_reviews")
          .select("*")
          .eq("organization_id", session.organizationId)
          .order("resolved_at", { ascending: false })
          .limit(200),
        admin
          .from("verification_results")
          .select("outcome")
          .eq("organization_id", session.organizationId)
          .gte("created_at", since),
        admin
          .from("device_jobs")
          .select("status,mode")
          .eq("organization_id", session.organizationId),
      ]);
    if (
      switchResult.error ||
      executions.error ||
      reviewsResult.error ||
      verifications.error ||
      deviceJobs.error
    )
      throw (
        switchResult.error ??
        executions.error ??
        reviewsResult.error ??
        verifications.error ??
        deviceJobs.error
      );
    const reviews = (
      (reviewsResult.data ?? []) as Record<string, unknown>[]
    ).map(pilotReview);
    const counts = {
      pending: reviews.filter((row) => row.reviewStatus === "pending").length,
      confirmed: reviews.filter((row) => row.reviewStatus === "confirmed")
        .length,
      incorrect: reviews.filter((row) => row.reviewStatus === "incorrect")
        .length,
      unsafe: reviews.filter((row) => row.reviewStatus === "unsafe").length,
    };
    const verificationRows = (verifications.data ?? []) as {
      outcome?: string;
    }[];
    const total = verificationRows.length;
    const passed = verificationRows.filter(
      (row) => row.outcome === "passed"
    ).length;
    const capabilityCounts = new Map<string, number>();
    for (const row of (executions.data ?? []) as { capability_id?: string }[]) {
      if (row.capability_id)
        capabilityCounts.set(
          row.capability_id,
          (capabilityCounts.get(row.capability_id) ?? 0) + 1
        );
    }
    const reopenTotal = reviews.filter(
      (row) => row.reviewSource === "reopen"
    ).length;
    return {
      paused:
        switchResult.data?.enabled === true &&
        typeof switchResult.data.reason === "string" &&
        switchResult.data.reason.startsWith("pilot_auto_pause:"),
      pauseReason:
        switchResult.data?.enabled === true &&
        typeof switchResult.data.reason === "string" &&
        switchResult.data.reason.startsWith("pilot_auto_pause:")
          ? switchResult.data.reason
          : null,
      executionsToday: (executions.data ?? []).length,
      limits: getPilotLimits(),
      verificationPassRate: total ? passed / total : 0,
      reopenRate: reviews.length ? reopenTotal / reviews.length : 0,
      reviews,
      reviewCounts: counts,
      perCapability: [...capabilityCounts.entries()].map(([id, count]) => ({
        id,
        count,
      })),
      deviceJobs: {
        total: deviceJobs.data?.length ?? 0,
        real: (deviceJobs.data ?? []).filter(
          (row) => !["cancelled", "expired"].includes(String(row.status))
        ).length,
        shadow: (deviceJobs.data ?? []).filter(
          (row) =>
            !["cancelled", "expired"].includes(String(row.status)) &&
            row.mode === "shadow"
        ).length,
        executed: (deviceJobs.data ?? []).filter(
          (row) =>
            !["cancelled", "expired"].includes(String(row.status)) &&
            row.mode === "execute"
        ).length,
      },
      error: null,
    };
  } catch (error) {
    return {
      paused: false,
      pauseReason: null,
      executionsToday: 0,
      limits: getPilotLimits(),
      verificationPassRate: 0,
      reopenRate: 0,
      reviews: [],
      reviewCounts: { pending: 0, confirmed: 0, incorrect: 0, unsafe: 0 },
      perCapability: [],
      deviceJobs: { total: 0, real: 0, shadow: 0, executed: 0 },
      error: error instanceof Error ? error.message : "Pilot data unavailable.",
    };
  }
}

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
  const capability = (value as JsonRecord).capability;
  const capabilityId =
    capability && typeof capability === "object"
      ? (capability as JsonRecord).id
      : (value as JsonRecord).capabilityId;
  const version =
    capability && typeof capability === "object"
      ? (capability as JsonRecord).version
      : (value as JsonRecord).capabilityVersion;
  if (typeof capabilityId !== "string") return null;
  return typeof version === "number"
    ? `${capabilityId}@${version}`
    : capabilityId;
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
  opts: { windowDays?: number; showExcluded?: boolean } = {}
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
  const excludedRuns =
    opts.showExcluded && session.role === "org_admin"
      ? new Set<string>()
      : await getExcludedRecordIds(
          admin,
          session.organizationId,
          "resolution_runs"
        );
  const rawRuns = withoutExcluded(
    (runResult.data ?? []) as RawRun[],
    excludedRuns
  );
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
    researchSources,
    deviceJobs,
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
    queryRows(admin, "research_sources", session.organizationId, [run.id]),
    queryRows(admin, "device_jobs", session.organizationId, [run.id]),
  ]);
  const deviceIds = (deviceJobs as Record<string, unknown>[])
    .map((job) => (typeof job.device_id === "string" ? job.device_id : null))
    .filter((id): id is string => id !== null);
  const deviceResult =
    deviceIds.length > 0
      ? await admin
          .from("devices_public")
          .select("id,hostname")
          .eq("organization_id", session.organizationId)
          .in("id", deviceIds)
      : { data: [], error: null };
  const hostnames = new Map(
    ((deviceResult.data ?? []) as { id?: string; hostname?: string | null }[])
      .filter((device) => typeof device.id === "string")
      .map((device) => [device.id as string, device.hostname ?? null])
  );
  const deviceJobsWithHostnames = (deviceJobs as Record<string, unknown>[])
    .filter((job) => job.mode !== "shadow")
    .map((job) => ({
      ...job,
      device_hostname:
        typeof job.device_id === "string"
          ? (hostnames.get(job.device_id) ?? null)
          : null,
    }));
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
  const shadowJobs = await getDeviceShadowActivity(
    admin,
    session.organizationId,
    { runId }
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
    researchSources: (researchSources as JudgedSourceRow[]).map((source) => ({
      url: source.url,
      domain: source.domain,
      title: source.title,
      trust: source.trust,
      judgement: source.judgement,
      snippet: source.snippet,
    })),
    deviceJobs: [...deviceJobsWithHostnames, ...shadowJobs],
  };
}

export type GuardrailOverview = {
  windowDays: number;
  allowed: number;
  blocked: number;
  blockReasons: Record<string, number>;
  injectionDetections: number;
  consentPending: number;
  approvalPending: number;
  killSwitchEvents: number;
  providerFailures: number;
  tenantViolations: number;
  verificationBlocks: number;
  events: {
    kind: string;
    reasonCode: string | null;
    actor: string | null;
    createdAt: string;
    detail: unknown;
  }[];
};

function reasonCode(detail: unknown): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }
  const value = (detail as Record<string, unknown>).reasonCode;
  return typeof value === "string" ? value : null;
}

export async function getGuardrailOverview(
  session: AdminSession,
  windowDays = 30
): Promise<GuardrailOverview> {
  const admin = createAdminClient();
  const start = new Date(
    Date.now() - Math.max(1, windowDays) * 86_400_000
  ).toISOString();
  const result = await admin
    .from("resolution_events")
    .select("kind,actor,detail,created_at")
    .eq("organization_id", session.organizationId)
    .gte("created_at", start)
    .like("kind", "guardrail.%")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (result.data ?? []) as {
    kind: string;
    actor: string | null;
    detail: unknown;
    created_at: string;
  }[];
  const blockReasons: Record<string, number> = {};
  for (const row of rows) {
    const code = reasonCode(row.detail);
    if (code) blockReasons[code] = (blockReasons[code] ?? 0) + 1;
  }
  const blockedKinds = new Set([
    "guardrail.output_rejected",
    "guardrail.tenant_mismatch",
    "guardrail.capability_unknown",
    "guardrail.policy_denied",
    "guardrail.consent_rejected",
    "guardrail.rate_limited",
    "guardrail.kill_switch_blocked",
    "guardrail.breaker_open",
    "guardrail.verification_missing",
    "guardrail.execution_disabled",
  ]);
  return {
    windowDays: Math.max(1, windowDays),
    allowed: rows.filter((row) => row.kind === "guardrail.execution_allowed")
      .length,
    blocked: rows.filter((row) => blockedKinds.has(row.kind)).length,
    blockReasons,
    injectionDetections: rows.filter(
      (row) => row.kind === "guardrail.prompt_injection_detected"
    ).length,
    consentPending: rows.filter(
      (row) => row.kind === "guardrail.consent_required"
    ).length,
    approvalPending: rows.filter(
      (row) => row.kind === "guardrail.approval_required"
    ).length,
    killSwitchEvents: rows.filter(
      (row) => row.kind === "guardrail.kill_switch_blocked"
    ).length,
    providerFailures: blockReasons.provider_unavailable ?? 0,
    tenantViolations: rows.filter(
      (row) => row.kind === "guardrail.tenant_mismatch"
    ).length,
    verificationBlocks: rows.filter(
      (row) => row.kind === "guardrail.verification_missing"
    ).length,
    events: rows.map((row) => ({
      kind: row.kind,
      reasonCode: reasonCode(row.detail),
      actor: row.actor,
      createdAt: row.created_at,
      detail: row.detail,
    })),
  };
}

export async function getGuardrailAggregate(
  session: AdminSession,
  windowDays = 30
): Promise<{
  allowed: number;
  blocked: number;
  injectionDetections: number;
  providerFailures: number;
  killSwitchEvents: number;
}> {
  if (!session.isPlatformAdmin) {
    throw new Error("Platform admin access required.");
  }
  const admin = createAdminClient();
  const start = new Date(
    Date.now() - Math.max(1, windowDays) * 86_400_000
  ).toISOString();
  const result = await admin
    .from("resolution_events")
    .select("kind,detail")
    .gte("created_at", start)
    .like("kind", "guardrail.%")
    .limit(2000);
  const rows = (result.data ?? []) as { kind: string; detail: unknown }[];
  const blocked = new Set([
    "guardrail.output_rejected",
    "guardrail.tenant_mismatch",
    "guardrail.capability_unknown",
    "guardrail.policy_denied",
    "guardrail.consent_rejected",
    "guardrail.rate_limited",
    "guardrail.kill_switch_blocked",
    "guardrail.breaker_open",
    "guardrail.verification_missing",
    "guardrail.execution_disabled",
  ]);
  const failures = rows.filter(
    (row) => reasonCode(row.detail) === "provider_unavailable"
  ).length;
  return {
    allowed: rows.filter((row) => row.kind === "guardrail.execution_allowed")
      .length,
    blocked: rows.filter((row) => blocked.has(row.kind)).length,
    injectionDetections: rows.filter(
      (row) => row.kind === "guardrail.prompt_injection_detected"
    ).length,
    providerFailures: failures,
    killSwitchEvents: rows.filter(
      (row) => row.kind === "guardrail.kill_switch_blocked"
    ).length,
  };
}
