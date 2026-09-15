import { snapshotEvidence } from "@/lib/evidence/snapshot";
import { isEvidenceEngineEnabled } from "@/lib/admin/flags";
import { isSafeString } from "@/lib/ai/safety-policy";
import { getAutonomyLimits } from "../config";
import { evaluateBreaker } from "../breaker";
import { buildIdempotencyKey } from "../idempotency";
import { readKillSwitches } from "../kill-switches";
import { buildPolicyInput } from "../policy/build-input";
import { decidePolicy } from "../policy/engine";
import { recordPolicyDecision } from "../policy/record";
import {
  getCapability,
  validateCapabilityInput,
} from "../capabilities/registry";
import { isCapabilityEnabled } from "../capabilities/enablement";
import { parsePlannerOutput, type PlannerOutput } from "../planner/schema";
import type { ResolutionRun } from "../orchestrator";
import { transitionRun } from "../orchestrator";
import { checkPreconditions } from "./preconditions";
import { getHandler } from "./handlers";
import type { HandlerAdmin } from "./handlers/types";
import { checkTenant } from "./tenant";
import { sanitizeOutput } from "./sanitize";

type PlanStep = { id: string; detail?: Record<string, unknown> };

export type ExecutePlanDeps = {
  stepId?: string;
  actor?: string;
  verify?: (input: {
    admin: HandlerAdmin;
    run: ResolutionRun;
    executionId: string | null;
  }) => Promise<{ outcome: "pending" }>;
  escalate?: (reason: string) => Promise<ResolutionRun | null>;
};

export async function verifyExecution(): Promise<{ outcome: "pending" }> {
  return { outcome: "pending" };
}

type Ticket = {
  platform: string | null;
  category: string | null;
};

type OrgPolicy = {
  grantedPolicies: string[];
  requireApprovalFor: string[];
};

function safeParameters(value: unknown): boolean {
  if (typeof value === "string") {
    return (
      isSafeString(value) &&
      !/\b(?:powershell|cmd(?:\.exe)?|terminal|shell|sudo)\b/i.test(value)
    );
  }
  if (Array.isArray(value)) return value.every(safeParameters);
  if (value && typeof value === "object") {
    return Object.values(value).every(safeParameters);
  }
  return true;
}

async function writeEvent(
  admin: HandlerAdmin,
  run: ResolutionRun,
  kind: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await admin.from("resolution_events").insert({
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind,
    actor: "orchestrator",
    detail,
  });
}

async function readTicket(
  admin: HandlerAdmin,
  run: ResolutionRun
): Promise<Ticket | null> {
  const result = await admin
    .from("tickets")
    .select("platform,category")
    .eq("id", run.ticket_id)
    .eq("organization_id", run.organization_id)
    .maybeSingle();
  return result.error || !result.data ? null : (result.data as Ticket);
}

export async function readOrgPolicy(
  admin: HandlerAdmin,
  organizationId: string
): Promise<OrgPolicy> {
  const result = await admin
    .from("organization_autonomy_policies")
    .select("granted_policies,require_approval_for")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (result.error || !result.data) {
    return { grantedPolicies: [], requireApprovalFor: [] };
  }
  return {
    grantedPolicies: Array.isArray(result.data.granted_policies)
      ? result.data.granted_policies
      : [],
    requireApprovalFor: Array.isArray(result.data.require_approval_for)
      ? result.data.require_approval_for
      : [],
  };
}

async function ensureStep(
  admin: HandlerAdmin,
  run: ResolutionRun,
  kind: "plan" | "policy" | "execute",
  detail: Record<string, unknown>,
  providedId?: string
): Promise<PlanStep> {
  if (providedId) return { id: providedId, detail };
  const result = await admin
    .from("resolution_steps")
    .insert({
      organization_id: run.organization_id,
      run_id: run.id,
      kind,
      position: run.attempts + 1,
      status: "pending",
      detail,
    })
    .select("id,detail")
    .single();
  if (result.error || !result.data)
    throw result.error ?? new Error("step insert failed");
  return result.data as PlanStep;
}

async function escalate(
  admin: HandlerAdmin,
  run: ResolutionRun,
  reason: string,
  deps: ExecutePlanDeps
): Promise<ResolutionRun | null> {
  if (deps.escalate) return deps.escalate(reason);
  const updated = await transitionRun(admin, run, "escalated", {
    actor: deps.actor ?? "orchestrator",
    detail: { reason },
  });
  if (!updated) return null;
  await admin
    .from("tickets")
    .update({
      status: "Needs Human",
      handoff_reason: reason,
      escalated: true,
      resolver_type: "unassigned",
    })
    .eq("id", run.ticket_id)
    .eq("organization_id", run.organization_id);
  return updated;
}

async function policyConsent(
  admin: HandlerAdmin,
  organizationId: string,
  stepId: string
): Promise<{ user: boolean; technician: boolean }> {
  const result = await admin
    .from("approval_requests")
    .select("type,status,expires_at")
    .eq("organization_id", organizationId)
    .eq("step_id", stepId)
    .eq("status", "granted")
    .order("created_at", { ascending: false })
    .limit(10);
  const now = Date.now();
  const rows = (result.data ?? []) as {
    type: string;
    status: string;
    expires_at: string | null;
  }[];
  return {
    user: rows.some(
      (row) =>
        row.type === "user_consent" &&
        (!row.expires_at || new Date(row.expires_at).getTime() > now)
    ),
    technician: rows.some(
      (row) =>
        row.type === "technician_approval" &&
        (!row.expires_at || new Date(row.expires_at).getTime() > now)
    ),
  };
}

async function failedAttempts(
  admin: HandlerAdmin,
  run: ResolutionRun,
  capabilityId: string,
  version: number
): Promise<{ prior: number; failures: number[] }> {
  const result = await admin
    .from("capability_executions")
    .select("status,created_at")
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .eq("capability_id", capabilityId)
    .eq("capability_version", version);
  const rows = (result.data ?? []) as {
    status: string;
    created_at: string;
  }[];
  return {
    prior: rows.filter((row) => ["failed", "timed_out"].includes(row.status))
      .length,
    failures: rows
      .filter((row) => row.status === "failed" || row.status === "timed_out")
      .map((row) => new Date(row.created_at).getTime()),
  };
}

async function createApproval(
  admin: HandlerAdmin,
  run: ResolutionRun,
  stepId: string,
  type: "user_consent" | "technician_approval"
): Promise<void> {
  await admin.from("approval_requests").insert({
    organization_id: run.organization_id,
    run_id: run.id,
    step_id: stepId,
    type,
    status: "requested",
    requested_by: "orchestrator",
    expires_at: new Date(
      Date.now() + (type === "user_consent" ? 60 * 60_000 : 24 * 60 * 60_000)
    ).toISOString(),
  });
}

async function executeHandler(
  admin: HandlerAdmin,
  run: ResolutionRun,
  stepId: string,
  capabilityId: string,
  version: number,
  params: Record<string, unknown>,
  maxRuntimeMs: number,
  deps: ExecutePlanDeps
): Promise<ResolutionRun | null> {
  const handler = getHandler(capabilityId, version);
  if (!handler) return escalate(admin, run, "capability_unavailable", deps);
  const key = buildIdempotencyKey({
    runId: run.id,
    stepId,
    capabilityId,
    capabilityVersion: version,
    parameters: params,
  });
  const existing = await admin
    .from("capability_executions")
    .select("id,status,result")
    .eq("organization_id", run.organization_id)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing.data) {
    await writeEvent(admin, run, "execution.replayed", {
      capabilityId,
      executionId: existing.data.id,
    });
    if (existing.data.status !== "succeeded") {
      await transitionRun(admin, run, "failed", {
        actor: deps.actor ?? "orchestrator",
        detail: { capabilityId, replayedStatus: existing.data.status },
      });
      return null;
    }
    const verifying = await transitionRun(admin, run, "verifying", {
      actor: deps.actor ?? "orchestrator",
    });
    if (verifying) {
      await (deps.verify ?? verifyExecution)({
        admin,
        run: verifying,
        executionId: existing.data.id,
      });
    }
    return verifying;
  }
  await writeEvent(admin, run, "execution.started", { capabilityId });
  const started = Date.now();
  const signal = AbortSignal.timeout(maxRuntimeMs);
  let result;
  let status: "succeeded" | "failed" | "timed_out";
  try {
    result = await handler.run(
      {
        admin,
        organizationId: run.organization_id,
        ticketId: run.ticket_id,
        runId: run.id,
        stepId,
        signal,
        actor: deps.actor ?? "orchestrator",
        escalate: async (reason) => {
          await escalate(admin, run, reason, deps);
        },
      },
      params
    );
    status = result.ok ? "succeeded" : signal.aborted ? "timed_out" : "failed";
  } catch (error) {
    result = {
      ok: false,
      output: {},
      error: error instanceof Error ? error.message : "handler failed",
    };
    status = signal.aborted ? "timed_out" : "failed";
  }
  const output = sanitizeOutput(result.output);
  const execution = await admin
    .from("capability_executions")
    .insert({
      organization_id: run.organization_id,
      run_id: run.id,
      step_id: stepId,
      capability_id: capabilityId,
      capability_version: version,
      idempotency_key: key,
      parameters: params,
      result: output,
      status,
      duration_ms: Date.now() - started,
    })
    .select("id")
    .single();
  const nextRun = await admin
    .from("resolution_runs")
    .update({ attempts: run.attempts + 1 })
    .eq("id", run.id)
    .eq("organization_id", run.organization_id)
    .select("*")
    .single();
  const updatedRun = (nextRun.data ?? {
    ...run,
    attempts: run.attempts + 1,
  }) as ResolutionRun;
  if (execution.error) {
    await writeEvent(admin, updatedRun, `execution.${status}`, {
      capabilityId,
      error: execution.error.message,
    });
  } else {
    await writeEvent(admin, updatedRun, `execution.${status}`, {
      capabilityId,
      executionId: execution.data?.id ?? null,
      error: result.error ?? null,
    });
  }
  if (status !== "succeeded") {
    await transitionRun(admin, updatedRun, "failed", {
      actor: deps.actor ?? "orchestrator",
      detail: { capabilityId, error: result.error ?? status },
    });
    return null;
  }
  const verifying = await transitionRun(admin, updatedRun, "verifying", {
    actor: deps.actor ?? "orchestrator",
  });
  if (verifying) {
    await (deps.verify ?? verifyExecution)({
      admin,
      run: verifying,
      executionId: execution.data?.id ?? null,
    });
  }
  if (verifying) await writeEvent(admin, verifying, "verification.pending");
  return verifying;
}

export async function executePlan(
  admin: HandlerAdmin,
  run: ResolutionRun,
  rawPlan: unknown,
  deps: ExecutePlanDeps = {}
): Promise<ResolutionRun | null> {
  const parsed = parsePlannerOutput(rawPlan);
  if (!parsed.ok) {
    await writeEvent(admin, run, "plan.rejected", { issues: parsed.issues });
    return escalate(admin, run, "plan_rejected", deps);
  }
  const plan: PlannerOutput = parsed.value;
  await writeEvent(admin, run, "plan.received", { plan });
  if ("decision" in plan) {
    return escalate(admin, run, plan.reason, deps);
  }
  const capability = getCapability(plan.capabilityId, plan.capabilityVersion);
  if (
    !capability ||
    !(await isCapabilityEnabled(admin, {
      organizationId: run.organization_id,
      id: plan.capabilityId,
      version: plan.capabilityVersion,
    }))
  ) {
    return escalate(admin, run, "capability_unavailable", deps);
  }
  const tenant = await checkTenant(
    admin,
    run.organization_id,
    run.ticket_id,
    plan.parameters
  );
  if (!tenant.ok) {
    await writeEvent(admin, run, "security.tenant_violation", {
      reason: tenant.reason,
    });
    return escalate(admin, run, "tenant_check_failed", deps);
  }
  const validated = validateCapabilityInput(
    capability.id,
    capability.version,
    plan.parameters
  );
  if (!validated.ok) return escalate(admin, run, "parameters_invalid", deps);
  if (!safeParameters(validated.value)) {
    return escalate(admin, run, "parameters_invalid", deps);
  }
  const preconditions = await checkPreconditions(
    {
      admin,
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      params: plan.parameters,
    },
    capability.preconditions
  );
  if (!preconditions.ok)
    return escalate(admin, run, "precondition_failed", deps);
  const policyStep = await ensureStep(
    admin,
    run,
    "policy",
    { plan },
    deps.stepId
  );
  const planningRun =
    run.status === "planning"
      ? await transitionRun(admin, run, "policy_check", {
          actor: deps.actor ?? "orchestrator",
        })
      : run;
  if (!planningRun) return null;
  const ticket = await readTicket(admin, run);
  if (!ticket) return escalate(admin, run, "ticket_not_found", deps);
  const attempts = await failedAttempts(
    admin,
    run,
    capability.id,
    capability.version
  );
  const limits = getAutonomyLimits();
  const breaker = evaluateBreaker(attempts.failures, Date.now(), {
    threshold: limits.breakerThreshold,
    windowMs: limits.breakerWindowMs,
  });
  const evidence = isEvidenceEngineEnabled()
    ? await snapshotEvidence(admin, run.ticket_id, run.organization_id)
    : null;
  const policyInput = buildPolicyInput({
    capability,
    capabilityEnabled: true,
    killSwitches: await readKillSwitches(
      admin,
      run.organization_id,
      capability.id
    ),
    breaker,
    evidence,
    actorRole: "system",
    platform: (ticket.platform as never) ?? null,
    ticketCategory: ticket.category,
    consent: await policyConsent(admin, run.organization_id, policyStep.id),
    priorFailedAttempts: attempts.prior,
    parametersValid: true,
    orgPolicy: await readOrgPolicy(admin, run.organization_id),
  });
  const decision = decidePolicy(policyInput);
  const recorded = await recordPolicyDecision(admin, {
    organizationId: run.organization_id,
    runId: run.id,
    stepId: policyStep.id,
    input: policyInput,
    decision,
  });
  await writeEvent(admin, planningRun, "policy.decided", {
    decision: decision.decision,
    reasons: decision.reasons,
    policyDecisionId: recorded.ok ? recorded.id : null,
  });
  if (decision.decision === "deny")
    return escalate(admin, planningRun, "policy_denied", deps);
  if (decision.decision === "specialist_only")
    return escalate(admin, planningRun, "specialist_only", deps);
  if (
    decision.decision === "require_user_consent" ||
    decision.decision === "require_technician_approval"
  ) {
    await createApproval(
      admin,
      planningRun,
      policyStep.id,
      decision.decision === "require_user_consent"
        ? "user_consent"
        : "technician_approval"
    );
    await writeEvent(admin, planningRun, "approval.requested", {
      type:
        decision.decision === "require_user_consent"
          ? "user_consent"
          : "technician_approval",
    });
    return transitionRun(
      admin,
      planningRun,
      decision.decision === "require_user_consent"
        ? "awaiting_consent"
        : "awaiting_approval",
      { actor: deps.actor ?? "orchestrator" }
    );
  }
  const executingRun = await transitionRun(admin, planningRun, "executing", {
    actor: deps.actor ?? "orchestrator",
  });
  if (!executingRun) return null;
  const executeStep = await ensureStep(
    admin,
    executingRun,
    "execute",
    { plan },
    undefined
  );
  return executeHandler(
    admin,
    executingRun,
    executeStep.id,
    capability.id,
    capability.version,
    validated.value as Record<string, unknown>,
    Math.min(capability.maxRuntimeMs, limits.runtimeMs),
    deps
  );
}
