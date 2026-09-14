import { createAdminClient } from "@/lib/supabase/admin";
import type { PolicyDecision, PolicyInput } from "./types";

type PolicyAdmin = ReturnType<typeof createAdminClient>;

export type RecordPolicyDecisionInput = {
  organizationId: string;
  runId: string;
  stepId: string;
  input: PolicyInput;
  decision: PolicyDecision;
};

export async function recordPolicyDecision(
  admin: PolicyAdmin,
  { organizationId, runId, stepId, input, decision }: RecordPolicyDecisionInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { data, error } = await admin
      .from("policy_decisions")
      .insert({
        organization_id: organizationId,
        run_id: runId,
        step_id: stepId,
        capability_id: input.capability.id,
        capability_version: input.capability.version,
        decision: decision.decision,
        reasons: decision.reasons,
        input,
        policy_version: decision.policyVersion,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: "Policy decision id missing." };
    return { ok: true, id: data.id as string };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not record policy decision.",
    };
  }
}
