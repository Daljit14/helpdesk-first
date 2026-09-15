import type { HandlerAdmin } from "./handlers/types";
import type { ResolutionRun } from "../orchestrator";
import { executePlan, type ExecutePlanDeps } from "./execute";
import { escalateRun, writeRunEvent } from "../orchestrator";
import { getCapability } from "../capabilities/registry";
import { parameterHash } from "../guardrails/hash";
import { verifyConsent } from "../guardrails/consent";

export async function resumeAfterApproval(
  admin: HandlerAdmin,
  run: ResolutionRun,
  deps: ExecutePlanDeps = {}
): Promise<ResolutionRun | null> {
  if (!["awaiting_consent", "awaiting_approval"].includes(run.status)) {
    return run;
  }
  const step = await admin
    .from("resolution_steps")
    .select("id,detail")
    .eq("run_id", run.id)
    .eq("organization_id", run.organization_id)
    .eq("kind", "plan")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (step.error || !step.data) {
    return escalateRun(admin, run, "approval_expired");
  }
  const approval = await admin
    .from("approval_requests")
    .select(
      "status,expires_at,capability_id,capability_version,parameter_hash,risk_level,decided_by_user_id"
    )
    .eq("run_id", run.id)
    .eq("organization_id", run.organization_id)
    .eq("step_id", step.data.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (approval.error || !approval.data) {
    return escalateRun(admin, run, "approval_expired");
  }
  const expiresAt = approval.data.expires_at
    ? new Date(approval.data.expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  if (approval.data.status === "requested" && expiresAt < Date.now()) {
    await admin
      .from("approval_requests")
      .update({ status: "expired" })
      .eq("organization_id", run.organization_id)
      .eq("step_id", step.data.id)
      .eq("status", "requested");
    return escalateRun(admin, run, "approval_expired");
  }
  if (approval.data.status === "requested") {
    return run;
  }
  if (approval.data.status === "denied") {
    return escalateRun(admin, run, "approval_denied");
  }
  if (approval.data.status !== "granted" || expiresAt < Date.now()) {
    return escalateRun(admin, run, "approval_expired");
  }
  const plan = step.data.detail?.plan;
  if (!plan) return escalateRun(admin, run, "approval_expired");
  const capabilityId =
    typeof plan.capability?.id === "string" ? plan.capability.id : "";
  const capabilityVersion =
    typeof plan.capability?.version === "number" ? plan.capability.version : 0;
  const capability = getCapability(capabilityId, capabilityVersion);
  if (!capability) return escalateRun(admin, run, "capability_unknown");
  const consent = await verifyConsent(admin, run, {
    type:
      run.status === "awaiting_consent"
        ? "user_consent"
        : "technician_approval",
    userId: deps.actor ?? run.initiated_by,
    organizationId: run.organization_id,
    ticketId: run.ticket_id,
    capabilityId,
    capabilityVersion,
    parameterHash: parameterHash({
      capabilityId,
      version: capabilityVersion,
      parameters: plan.capability.parameters,
    }),
    riskLevel: capability.riskLevel,
  });
  if (!consent.ok) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind:
        consent.code === "consent_missing"
          ? "guardrail.consent_required"
          : "guardrail.consent_rejected",
      actor: deps.actor ?? "orchestrator",
      detail: { reasonCode: consent.code },
    });
    return escalateRun(admin, run, consent.code);
  }
  return executePlan(admin, run, plan, {
    ...deps,
    stepId: step.data.id,
  });
}
