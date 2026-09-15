import type { HandlerAdmin } from "./handlers/types";
import type { ResolutionRun } from "../orchestrator";
import { executePlan, type ExecutePlanDeps } from "./execute";
import { escalateRun, transitionRun } from "../orchestrator";

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
    .select("status,expires_at")
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
  if (approval.data.status === "denied") {
    return escalateRun(admin, run, "approval_denied");
  }
  if (approval.data.status !== "granted" || expiresAt < Date.now()) {
    return escalateRun(admin, run, "approval_expired");
  }
  const plan = step.data.detail?.plan;
  if (!plan) return escalateRun(admin, run, "approval_expired");
  const planning = await transitionRun(admin, run, "planning", {
    actor: deps.actor ?? "orchestrator",
  });
  if (!planning) return null;
  return executePlan(admin, planning, plan, {
    ...deps,
    stepId: step.data.id,
  });
}
