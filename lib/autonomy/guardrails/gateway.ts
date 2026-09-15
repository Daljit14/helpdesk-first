import { alertSecurityEvent } from "../alerts";
import { auditVersions } from "../audit/versions";
import { readBreakerState, recordBreakerOutcome } from "../breaker";
import { isAutonomousExecutionEnabled, getAutonomyLimits } from "../config";
import { buildIdempotencyKey } from "../idempotency";
import { readKillSwitches } from "../kill-switches";
import type { PolicyDecision } from "../policy/types";
import type { CapabilityDefinition } from "../capabilities/types";
import { isCapabilityEnabled } from "../capabilities/enablement";
import { sanitizeOutput } from "../executor/sanitize";
import { getHandler } from "../executor/handlers";
import type { HandlerAdmin } from "../executor/handlers/types";
import { transitionRun, type ResolutionRun } from "../orchestrator";
import { redactAuditDetail } from "../audit/redact";
import { assertGuardrailsEnforced } from "./enforce";
import type { PlannerPlanV2 } from "./planner-output";
import { parameterHash } from "./hash";
import { verifyConsent } from "./consent";

export type GatewayRequest = {
  run: ResolutionRun;
  plan: PlannerPlanV2;
  capability: CapabilityDefinition;
  policy: PolicyDecision & {
    parameterHash?: string;
    consent?: { type: "user_consent" | "technician_approval"; userId: string };
  };
  actor: string;
  idempotencyKey: string;
  stepId: string;
  verify: (input: {
    admin: HandlerAdmin;
    run: ResolutionRun;
    executionId: string | null;
  }) => Promise<{ outcome: "pending" }>;
};

export type GatewayDenied = {
  ok: false;
  code: string;
  run: ResolutionRun | null;
};

export type GatewayAllowed = {
  ok: true;
  run: ResolutionRun | null;
};

export type GatewayResult = GatewayDenied | GatewayAllowed;

async function guardrailEvent(
  admin: HandlerAdmin,
  run: ResolutionRun,
  kind: string,
  reasonCode: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await admin.from("resolution_events").insert({
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind,
    actor: "orchestrator",
    initiated_by: "ai",
    versions: auditVersions(),
    detail: redactAuditDetail({ ...detail, reasonCode }),
  });
}

async function deny(
  admin: HandlerAdmin,
  req: GatewayRequest,
  code: string,
  kind = "guardrail.execution_disabled"
): Promise<GatewayDenied> {
  await guardrailEvent(admin, req.run, kind, code, {
    capability: `${req.capability.id}@${req.capability.version}`,
  });
  return { ok: false, code, run: req.run };
}

export async function executeThroughGateway(
  admin: HandlerAdmin,
  req: GatewayRequest
): Promise<GatewayResult> {
  try {
    assertGuardrailsEnforced();
  } catch {
    return deny(admin, req, "guardrails_not_enforced");
  }
  if (!isAutonomousExecutionEnabled()) {
    return deny(admin, req, "execution_disabled");
  }
  if (req.run.status !== "executing") {
    return deny(admin, req, "invalid_run_state", "guardrail.policy_denied");
  }
  const step = await admin
    .from("resolution_steps")
    .select("detail")
    .eq("organization_id", req.run.organization_id)
    .eq("run_id", req.run.id)
    .eq("id", req.stepId)
    .maybeSingle();
  const planStep = await admin
    .from("resolution_steps")
    .select("detail")
    .eq("organization_id", req.run.organization_id)
    .eq("run_id", req.run.id)
    .eq("kind", "plan")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stepDetail = planStep.data?.detail ?? step.data?.detail ?? null;
  const plannerProvider =
    stepDetail &&
    typeof stepDetail === "object" &&
    !Array.isArray(stepDetail) &&
    typeof (stepDetail as Record<string, unknown>).plannerProvider === "string"
      ? ((stepDetail as Record<string, unknown>).plannerProvider as string)
      : undefined;
  const switches = await readKillSwitches(
    admin,
    req.run.organization_id,
    req.capability.id,
    plannerProvider
  );
  if (switches.anyActive) {
    await alertSecurityEvent(admin, {
      organizationId: req.run.organization_id,
      ticketId: req.run.ticket_id,
      runId: req.run.id,
      kind: "security.kill_switch",
      detail: { reasons: switches.reasons },
    });
    return deny(
      admin,
      req,
      "kill_switch_active",
      "guardrail.kill_switch_blocked"
    );
  }
  const breaker = await readBreakerState(
    admin,
    req.run.organization_id,
    req.capability.id,
    new Date()
  );
  if (breaker.open) {
    return deny(admin, req, "breaker_open", "guardrail.breaker_open");
  }
  const ticket = await admin
    .from("tickets")
    .select("id,organization_id")
    .eq("id", req.run.ticket_id)
    .eq("organization_id", req.run.organization_id)
    .maybeSingle();
  if (ticket.error || !ticket.data) {
    return deny(admin, req, "tenant_mismatch", "guardrail.tenant_mismatch");
  }
  if (
    !(await isCapabilityEnabled(admin, {
      organizationId: req.run.organization_id,
      id: req.capability.id,
      version: req.capability.version,
    }))
  ) {
    return deny(
      admin,
      req,
      "capability_disabled",
      "guardrail.capability_unknown"
    );
  }
  if (
    ![
      "allow_automatic",
      "require_user_consent",
      "require_technician_approval",
    ].includes(req.policy.decision)
  ) {
    return deny(admin, req, "policy_denied", "guardrail.policy_denied");
  }
  const validated = req.capability.inputSchema.safeParse(
    req.plan.capability.parameters
  );
  if (!validated.success) {
    return deny(admin, req, "parameters_invalid", "guardrail.policy_denied");
  }
  const computedHash = parameterHash({
    capabilityId: req.capability.id,
    version: req.capability.version,
    parameters: req.plan.capability.parameters,
  });
  if (req.policy.parameterHash && req.policy.parameterHash !== computedHash) {
    return deny(admin, req, "parameters_changed", "guardrail.policy_denied");
  }
  if (req.run.attempts >= getAutonomyLimits().maxAttempts) {
    return deny(admin, req, "attempts_exhausted", "guardrail.rate_limited");
  }
  const estimatedCost = req.capability.estimatedCostCents ?? 1;
  if (req.run.cost_cents + estimatedCost > req.run.budget_cents) {
    return deny(admin, req, "budget_exhausted", "guardrail.rate_limited");
  }
  const executing = await admin
    .from("resolution_runs")
    .select("id")
    .eq("organization_id", req.run.organization_id)
    .eq("status", "executing");
  if (
    (executing.data ?? []).length >= getAutonomyLimits().maxConcurrentPerOrg
  ) {
    return deny(admin, req, "concurrency_limit", "guardrail.rate_limited");
  }
  const failures = await admin
    .from("capability_executions")
    .select("parameters,status")
    .eq("organization_id", req.run.organization_id)
    .eq("run_id", req.run.id)
    .eq("capability_id", req.capability.id)
    .eq("capability_version", req.capability.version)
    .in("status", ["failed", "timed_out"]);
  const repeatedFailure = (failures.data ?? []).some((row) => {
    const parameters = row.parameters;
    return (
      parameterHash({
        capabilityId: req.capability.id,
        version: req.capability.version,
        parameters,
      }) === computedHash
    );
  });
  if (repeatedFailure) {
    return deny(admin, req, "repeated_failure", "guardrail.rate_limited");
  }
  const key =
    req.idempotencyKey ||
    buildIdempotencyKey({
      runId: req.run.id,
      stepId: req.stepId,
      capabilityId: req.capability.id,
      capabilityVersion: req.capability.version,
      parameters: req.plan.capability.parameters,
    });
  const existing = await admin
    .from("capability_executions")
    .select("id,status")
    .eq("organization_id", req.run.organization_id)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing.data) {
    await alertSecurityEvent(admin, {
      organizationId: req.run.organization_id,
      ticketId: req.run.ticket_id,
      runId: req.run.id,
      kind: "security.replay_detected",
      detail: { executionId: existing.data.id },
    });
    await guardrailEvent(
      admin,
      req.run,
      "guardrail.execution_allowed",
      "replay",
      {
        replay: true,
        executionId: existing.data.id,
      }
    );
    return { ok: true, run: req.run };
  }
  const handler = getHandler(req.capability.id, req.capability.version);
  if (!handler) {
    await alertSecurityEvent(admin, {
      organizationId: req.run.organization_id,
      ticketId: req.run.ticket_id,
      runId: req.run.id,
      kind: "security.unknown_capability",
      detail: {
        capabilityId: req.capability.id,
        capabilityVersion: req.capability.version,
      },
    });
    return deny(
      admin,
      req,
      "capability_unknown",
      "guardrail.capability_unknown"
    );
  }
  if (
    req.capability.consent !== "none" &&
    (req.policy.decision === "allow_automatic" ||
      req.policy.consentSatisfied !== false)
  ) {
    return deny(admin, req, "consent_missing", "guardrail.consent_rejected");
  }
  if (
    req.policy.decision === "require_user_consent" ||
    req.policy.decision === "require_technician_approval"
  ) {
    const expectedType =
      req.policy.decision === "require_user_consent"
        ? "user_consent"
        : "technician_approval";
    if (!req.policy.consent || req.policy.consent.type !== expectedType) {
      return deny(admin, req, "consent_missing", "guardrail.consent_rejected");
    }
    const consumed = await verifyConsent(admin, req.run, {
      type: expectedType,
      userId: req.policy.consent.userId,
      organizationId: req.run.organization_id,
      ticketId: req.run.ticket_id,
      capabilityId: req.capability.id,
      capabilityVersion: req.capability.version,
      parameterHash: computedHash,
      riskLevel: req.capability.riskLevel,
    });
    if (!consumed.ok) {
      return deny(admin, req, consumed.code, "guardrail.consent_rejected");
    }
  }
  const started = Date.now();
  await guardrailEvent(
    admin,
    req.run,
    "guardrail.execution_allowed",
    "allowed",
    {
      capability: `${req.capability.id}@${req.capability.version}`,
    }
  );
  let result: { ok: boolean; output: unknown; error?: string };
  const signal = AbortSignal.timeout(
    Math.min(req.capability.maxRuntimeMs, getAutonomyLimits().runtimeMs)
  );
  try {
    result = await handler.run(
      {
        admin,
        organizationId: req.run.organization_id,
        ticketId: req.run.ticket_id,
        runId: req.run.id,
        stepId: req.stepId,
        signal,
        actor: req.actor,
        escalate: async () => undefined,
      },
      req.plan.capability.parameters
    );
  } catch (error) {
    result = {
      ok: false,
      output: {},
      error: error instanceof Error ? error.message : "handler failed",
    };
  }
  const status = result.ok
    ? "succeeded"
    : signal.aborted
      ? "timed_out"
      : "failed";
  const output = sanitizeOutput(result.output);
  await recordBreakerOutcome(
    admin,
    req.run.organization_id,
    req.capability.id,
    status === "succeeded",
    new Date()
  );
  const execution = await admin
    .from("capability_executions")
    .insert({
      organization_id: req.run.organization_id,
      run_id: req.run.id,
      step_id: req.stepId,
      capability_id: req.capability.id,
      capability_version: req.capability.version,
      idempotency_key: key,
      parameters: req.plan.capability.parameters,
      result: redactAuditDetail(output),
      status,
      duration_ms: Date.now() - started,
      initiated_by: "ai",
      versions: auditVersions(req.capability),
    })
    .select("id")
    .single();
  const nextRun = await admin
    .from("resolution_runs")
    .update({
      attempts: req.run.attempts + 1,
      cost_cents: req.run.cost_cents + estimatedCost,
    })
    .eq("id", req.run.id)
    .eq("organization_id", req.run.organization_id)
    .select("*")
    .single();
  const updatedRun = (nextRun.data ?? {
    ...req.run,
    attempts: req.run.attempts + 1,
    cost_cents: req.run.cost_cents + estimatedCost,
  }) as ResolutionRun;
  if (status !== "succeeded") {
    return {
      ok: true,
      run: await transitionRun(admin, updatedRun, "failed", {
        actor: req.actor,
        detail: {
          capabilityId: req.capability.id,
          error: result.error ?? status,
        },
      }),
    };
  }
  const verifying = await transitionRun(admin, updatedRun, "verifying", {
    actor: req.actor,
  });
  if (verifying) {
    await req.verify({
      admin,
      run: verifying,
      executionId: execution.data?.id ?? null,
    });
  }
  return { ok: true, run: verifying };
}
