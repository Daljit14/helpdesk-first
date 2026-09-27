import { isEvidenceEngineEnabled } from "@/lib/admin/flags";
import { buildEvidence } from "@/lib/evidence/build";
import { loadEvidenceInputs } from "@/lib/evidence/load";
import { isSafeString } from "@/lib/ai/safety-policy";
import { getAutonomyLimits, isVerificationEngineEnabled } from "../config";
import { evaluateBreaker, readBreakerState } from "../breaker";
import { alertSecurityEvent } from "../alerts";
import { redactAuditDetail } from "../audit/redact";
import { auditVersions } from "../audit/versions";
import { buildIdempotencyKey } from "../idempotency";
import { readKillSwitches } from "../kill-switches";
import { buildPolicyInput } from "../policy/build-input";
import { decidePolicy } from "../policy/engine";
import { recordPolicyDecision } from "../policy/record";
import {
  getCapability,
  capabilityStatus,
  validateCapabilityInput,
} from "../capabilities/registry";
import {
  CAPABILITY_PLATFORMS,
  type CapabilityDefinition,
  type CapabilityPlatform,
} from "../capabilities/types";
import { isCapabilityEnabled } from "../capabilities/enablement";
import { parsePlannerOutput, type PlannerOutput } from "../planner/schema";
import type { ResolutionRun } from "../orchestrator";
import { resolutionStepPosition, transitionRun } from "../orchestrator";
import { checkPreconditions } from "./preconditions";
import type { HandlerAdmin } from "./handlers/types";
import { checkTenant } from "./tenant";
import type { PolicyDecision, PolicyInput } from "../policy/types";
import { verifyRun } from "../verification/engine";
import { assertGuardrailsEnforced } from "../guardrails/enforce";
import { executeThroughGateway } from "../guardrails/gateway";
import type { PlannerPlanV2 } from "../guardrails/planner-output";
import { parameterHash } from "../guardrails/hash";
import { readBoundConsent } from "../guardrails/consent";
import { getDeviceAction } from "@/lib/device-agent/catalog";
import { findDeviceForTicket } from "@/lib/device-agent/server/jobs";

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
  consent?: {
    type: "user_consent" | "technician_approval";
    userId: string;
  };
  consentTtlMs?: number;
  forceUserConsent?: boolean;
};

export async function verifyExecution(input: {
  admin: HandlerAdmin;
  run: ResolutionRun;
  executionId: string | null;
}): Promise<{ outcome: "pending" }> {
  if (isVerificationEngineEnabled()) {
    await verifyRun(input.admin, input.run);
  }
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

type PolicyEvaluation =
  | {
      ok: true;
      decision: PolicyDecision;
      input: PolicyInput;
      capability: CapabilityDefinition;
      validatedParameters: Record<string, unknown>;
    }
  | {
      ok: false;
      reason: string;
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

function capabilityPlatform(value: string | null): CapabilityPlatform | null {
  return value && CAPABILITY_PLATFORMS.includes(value as CapabilityPlatform)
    ? (value as CapabilityPlatform)
    : null;
}

async function readEvidence(
  admin: HandlerAdmin,
  ticketId: string,
  organizationId: string
) {
  if (!isEvidenceEngineEnabled()) return null;
  const snapshot = await admin
    .from("ticket_investigations")
    .select("evidence")
    .eq("ticket_id", ticketId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!snapshot.error && snapshot.data?.evidence) {
    return snapshot.data.evidence as Awaited<ReturnType<typeof buildEvidence>>;
  }
  const inputs = await loadEvidenceInputs(admin, ticketId, organizationId);
  return inputs ? buildEvidence(inputs) : null;
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
    detail: redactAuditDetail(detail),
    initiated_by: "ai",
    versions: auditVersions(),
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
      position: resolutionStepPosition(run.attempts, kind),
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
  type: "user_consent" | "technician_approval",
  capability: CapabilityDefinition,
  params: Record<string, unknown>,
  riskLevel: string,
  expiresInMs = type === "user_consent" ? 60 * 60_000 : 24 * 60 * 60_000
): Promise<void> {
  await admin.from("approval_requests").insert({
    organization_id: run.organization_id,
    run_id: run.id,
    step_id: stepId,
    ticket_id: run.ticket_id,
    capability_id: capability.id,
    capability_version: capability.version,
    parameter_hash: parameterHash({
      capabilityId: capability.id,
      version: capability.version,
      parameters: params,
    }),
    risk_level: riskLevel,
    nonce: crypto.randomUUID(),
    type,
    status: "requested",
    requested_by: "orchestrator",
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
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
  deps: ExecutePlanDeps,
  policy: PolicyDecision
): Promise<ResolutionRun | null> {
  const capability = getCapability(capabilityId, version);
  if (!capability) return escalate(admin, run, "capability_unavailable", deps);
  const plan: PlannerPlanV2 = {
    ticketId: run.ticket_id,
    diagnosis: {
      summary: "Approved planner action",
      confidence: 1,
      evidenceIds: ["ticket"],
    },
    decision: "propose_action",
    capability: {
      id: capabilityId,
      version,
      parameters: params as Record<string, string | number | boolean | null>,
    },
    verificationMethod: capability.verification,
  };
  const result = await executeThroughGateway(admin, {
    run,
    plan,
    capability,
    policy: {
      ...policy,
      parameterHash: parameterHash({
        capabilityId,
        version,
        parameters: params,
      }),
      consent: deps.consent,
    },
    actor: deps.actor ?? "orchestrator",
    idempotencyKey: buildIdempotencyKey({
      runId: run.id,
      stepId,
      capabilityId,
      capabilityVersion: version,
      parameters: params,
    }),
    stepId,
    verify: deps.verify ?? verifyExecution,
  });
  if (!result.ok) return escalate(admin, run, result.code, deps);
  return result.run;
}

export async function evaluatePlanPolicy(
  admin: HandlerAdmin,
  run: ResolutionRun,
  rawPlan: unknown,
  stepId: string
): Promise<PolicyEvaluation> {
  const parsed = parsePlannerOutput(rawPlan);
  if (!parsed.ok) return { ok: false, reason: "plan_rejected" };
  if (parsed.value.decision !== "propose_action") {
    return { ok: false, reason: parsed.value.reason };
  }
  const plan = parsed.value;
  const capability = getCapability(plan.capability.id, plan.capability.version);
  if (
    !capability ||
    !(await isCapabilityEnabled(admin, {
      organizationId: run.organization_id,
      id: plan.capability.id,
      version: plan.capability.version,
    }))
  ) {
    return { ok: false, reason: "capability_unavailable" };
  }
  const tenant = await checkTenant(
    admin,
    run.organization_id,
    run.ticket_id,
    plan.capability.parameters
  );
  if (!tenant.ok) return { ok: false, reason: "tenant_check_failed" };
  const validated = validateCapabilityInput(
    capability.id,
    capability.version,
    plan.capability.parameters
  );
  if (!validated.ok || !safeParameters(validated.value)) {
    return { ok: false, reason: "parameters_invalid" };
  }
  const preconditions = await checkPreconditions(
    {
      admin,
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      params: plan.capability.parameters,
    },
    capability.preconditions
  );
  if (!preconditions.ok) {
    return { ok: false, reason: "precondition_failed" };
  }
  const ticket = await readTicket(admin, run);
  if (!ticket) return { ok: false, reason: "ticket_not_found" };
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
  const persistedBreaker = await readBreakerState(
    admin,
    run.organization_id,
    capability.id,
    new Date()
  );
  const evidence = await readEvidence(
    admin,
    run.ticket_id,
    run.organization_id
  );
  const deviceAction = getDeviceAction(capability.id, capability.version);
  let devicePolicy: PolicyInput["device"] | undefined;
  if (deviceAction) {
    const device = await findDeviceForTicket(admin, {
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      platform: ticket.platform,
    });
    if (device) {
      const policy = await admin
        .from("device_consent_policies")
        .select("auto_approve")
        .eq("organization_id", run.organization_id)
        .eq("device_class", device.device_class)
        .eq("category", deviceAction.category)
        .maybeSingle();
      devicePolicy = {
        category: deviceAction.category,
        deviceClass: device.device_class,
        reversible: deviceAction.reversible,
        irreversible: deviceAction.irreversible,
        preApproved: policy.data?.auto_approve === true,
      };
    }
  }
  const policyInput = buildPolicyInput({
    capability,
    capabilityEnabled: true,
    killSwitches: await readKillSwitches(
      admin,
      run.organization_id,
      capability.id
    ),
    breaker: { open: breaker.open || persistedBreaker.open },
    evidence,
    actorRole: "system",
    platform: capabilityPlatform(ticket.platform),
    ticketCategory: ticket.category,
    consent: await readBoundConsent(admin, run, {
      stepId,
      capabilityId: capability.id,
      version: capability.version,
      parameterHash: parameterHash({
        capabilityId: capability.id,
        version: capability.version,
        parameters: plan.capability.parameters,
      }),
    }),
    priorFailedAttempts: attempts.prior,
    parametersValid: true,
    orgPolicy: await readOrgPolicy(admin, run.organization_id),
    capabilityStatus: capabilityStatus(capability),
    plannerDisagreement: false,
    evidenceContradiction:
      evidence?.research?.contradictsTopHypothesis ?? false,
    device: devicePolicy,
  });
  return {
    ok: true,
    decision: decidePolicy(policyInput),
    input: policyInput,
    capability,
    validatedParameters: validated.value as Record<string, unknown>,
  };
}

export async function executePlan(
  admin: HandlerAdmin,
  run: ResolutionRun,
  rawPlan: unknown,
  deps: ExecutePlanDeps = {}
): Promise<ResolutionRun | null> {
  assertGuardrailsEnforced();
  const parsed = parsePlannerOutput(rawPlan);
  if (!parsed.ok) {
    await writeEvent(admin, run, "plan.rejected", { issues: parsed.issues });
    await alertSecurityEvent(admin, {
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      runId: run.id,
      kind: "security.plan_rejected",
      detail: { issues: parsed.issues },
    });
    return escalate(admin, run, "plan_rejected", deps);
  }
  const plan: PlannerOutput = parsed.value;
  if (
    plan.decision === "propose_action" &&
    !getCapability(plan.capability.id, plan.capability.version)
  ) {
    await writeEvent(admin, run, "security.unknown_capability", {
      capabilityId: plan.capability.id,
      capabilityVersion: plan.capability.version,
    });
    await alertSecurityEvent(admin, {
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      runId: run.id,
      kind: "security.unknown_capability",
      detail: {
        capabilityId: plan.capability.id,
        capabilityVersion: plan.capability.version,
      },
    });
  }
  await writeEvent(admin, run, "plan.received", { plan });
  if (plan.decision !== "propose_action") {
    return escalate(admin, run, plan.reason, deps);
  }
  const policyStep = await ensureStep(
    admin,
    run,
    "policy",
    { plan },
    deps.stepId
  );
  const evaluated = await evaluatePlanPolicy(admin, run, plan, policyStep.id);
  if (!evaluated.ok) {
    if (evaluated.reason === "tenant_check_failed") {
      await writeEvent(admin, run, "security.tenant_violation", {
        reason: evaluated.reason,
      });
      await alertSecurityEvent(admin, {
        organizationId: run.organization_id,
        ticketId: run.ticket_id,
        runId: run.id,
        kind: "security.tenant_violation",
        detail: { reason: evaluated.reason },
      });
    }
    return escalate(admin, run, evaluated.reason, deps);
  }
  const { capability, input: policyInput } = evaluated;
  let decision = evaluated.decision;
  if (
    deps.forceUserConsent &&
    capability.sideEffects !== "read_only" &&
    decision.decision === "allow_automatic"
  ) {
    decision = {
      ...decision,
      decision: "require_user_consent",
      reasons: [...decision.reasons, "requester_agent_forced_consent"],
      consentSatisfied: false,
    };
  }
  if (deps.consent && capability.consent !== "none") {
    decision = decidePolicy({
      ...policyInput,
      consent: { user: false, technician: false },
    });
  }
  const planningRun =
    run.status === "planning"
      ? await transitionRun(admin, run, "policy_check", {
          actor: deps.actor ?? "orchestrator",
        })
      : run;
  if (!planningRun) return null;
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
  if (policyInput.breakerOpen) {
    await writeEvent(admin, planningRun, "security.breaker_open", {
      capabilityId: capability.id,
      capabilityVersion: capability.version,
    });
    await alertSecurityEvent(admin, {
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      runId: run.id,
      kind: "security.breaker_open",
      detail: {
        capabilityId: capability.id,
        capabilityVersion: capability.version,
      },
    });
  }
  if (decision.reasons.includes("kill_switch_active")) {
    await writeEvent(admin, planningRun, "security.kill_switch", {
      capabilityId: capability.id,
      capabilityVersion: capability.version,
    });
    await alertSecurityEvent(admin, {
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      runId: run.id,
      kind: "security.kill_switch",
      detail: {
        capabilityId: capability.id,
        capabilityVersion: capability.version,
      },
    });
  }
  if (decision.decision === "deny")
    return escalate(admin, planningRun, "policy_denied", deps);
  if (decision.decision === "specialist_only")
    return escalate(admin, planningRun, "specialist_only", deps);
  const requiredConsentType =
    decision.decision === "require_user_consent"
      ? "user_consent"
      : decision.decision === "require_technician_approval"
        ? "technician_approval"
        : null;
  if (requiredConsentType && deps.consent?.type !== requiredConsentType) {
    await createApproval(
      admin,
      planningRun,
      policyStep.id,
      requiredConsentType,
      capability,
      evaluated.validatedParameters,
      capability.riskLevel,
      deps.consentTtlMs
    );
    await writeEvent(admin, planningRun, "approval.requested", {
      type: requiredConsentType,
    });
    try {
      const approvalRun = await transitionRun(
        admin,
        planningRun,
        requiredConsentType === "user_consent"
          ? "awaiting_consent"
          : "awaiting_approval",
        { actor: deps.actor ?? "orchestrator" }
      );
      if (approvalRun) return approvalRun;
    } catch {
      // Escalate below when the approval state is not reachable.
    }
    return escalate(admin, planningRun, "approval_transition_failed", deps);
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
    evaluated.validatedParameters,
    Math.min(capability.maxRuntimeMs, getAutonomyLimits().runtimeMs),
    deps,
    decision
  );
}
