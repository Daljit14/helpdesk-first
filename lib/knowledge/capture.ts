import { getCapability } from "@/lib/autonomy/capabilities/registry";
import { isKnowledgeCaptureEnabled } from "@/lib/admin/flags";
import { isSessionTainted } from "@/lib/agent/taint";
import type { AgentSession } from "@/lib/agent/types";
import { createKnowledgeDraftForTicket } from "@/lib/knowledge/learning";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function captureAgentResolution(
  admin: Admin,
  session: AgentSession
): Promise<void> {
  if (!isKnowledgeCaptureEnabled()) return;
  try {
    if (
      session.status !== "resolved" ||
      !session.user_confirmed_at ||
      session.security_flag ||
      !session.backing_ticket_id ||
      !session.resolution_run_id ||
      !session.verified_execution_id
    )
      return;

    const decisions = await admin
      .from("agent_steps")
      .select("policy_decision")
      .eq("session_id", session.id);
    if (
      decisions.error ||
      isSessionTainted(
        (decisions.data ?? []).map((row) =>
          typeof row.policy_decision === "string" ? row.policy_decision : null
        )
      )
    )
      return;

    const [ticketResult, verificationResult, executionResult] =
      await Promise.all([
        admin
          .from("tickets")
          .select("resolution_report")
          .eq("id", session.backing_ticket_id)
          .eq("organization_id", session.organization_id)
          .maybeSingle(),
        admin
          .from("verification_results")
          .select("outcome,method,execution_id")
          .eq("run_id", session.resolution_run_id)
          .eq("organization_id", session.organization_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("capability_executions")
          .select("capability_id,capability_version,step_id")
          .eq("id", session.verified_execution_id)
          .eq("run_id", session.resolution_run_id)
          .eq("organization_id", session.organization_id)
          .maybeSingle(),
      ]);
    const verification = verificationResult.data;
    const execution = executionResult.data;
    if (
      ticketResult.error ||
      verificationResult.error ||
      executionResult.error ||
      !ticketResult.data ||
      ticketResult.data.resolution_report !== null ||
      !verification ||
      verification.outcome !== "passed" ||
      verification.execution_id !== session.verified_execution_id ||
      !execution?.step_id
    )
      return;

    const planResult = await admin
      .from("resolution_steps")
      .select("detail")
      .eq("id", execution.step_id)
      .eq("run_id", session.resolution_run_id)
      .eq("organization_id", session.organization_id)
      .eq("kind", "plan")
      .maybeSingle();
    if (planResult.error || !planResult.data) return;

    const plan = record(record(planResult.data?.detail)?.plan);
    const diagnosis = record(plan?.diagnosis);
    const capabilityInfo = record(plan?.capability);
    const hypothesis =
      typeof diagnosis?.summary === "string"
        ? diagnosis.summary.replace(/^Evidence [^:]+:\s*/, "").trim()
        : "";
    if (
      !capabilityInfo ||
      capabilityInfo.id !== execution.capability_id ||
      capabilityInfo.version !== execution.capability_version
    )
      return;
    const capability = getCapability(
      execution.capability_id,
      execution.capability_version
    );
    const verificationMethod =
      typeof verification.method === "string" ? verification.method : "";
    if (!hypothesis || !capability || !verificationMethod) return;

    const resolutionReport = {
      source: "agent_session",
      rootCause: hypothesis,
      actionsPerformed: `${capability.id}; verification passed (${verificationMethod}).`,
      toolsUsed: capability.id,
      preventiveRecommendation:
        "No preventive step recorded (agent resolution).",
    };
    const updated = await admin
      .from("tickets")
      .update({ resolution_report: resolutionReport })
      .eq("id", session.backing_ticket_id)
      .eq("organization_id", session.organization_id)
      .is("resolution_report", null)
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) return;

    await createKnowledgeDraftForTicket(
      admin,
      session.backing_ticket_id,
      session.organization_id,
      { sourceKind: "agent_session", agentSessionId: session.id }
    );
  } catch {
    return;
  }
}
