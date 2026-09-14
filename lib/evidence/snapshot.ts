import { isEvidenceEngineEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEvidence } from "./build";
import { loadEvidenceInputs } from "./load";
import type { EvidenceRecord } from "./types";

export async function snapshotEvidence(
  admin: ReturnType<typeof createAdminClient>,
  ticketId: string,
  organizationId: string
): Promise<EvidenceRecord | null> {
  if (!isEvidenceEngineEnabled()) return null;
  try {
    const inputs = await loadEvidenceInputs(admin, ticketId, organizationId);
    if (!inputs) return null;
    const evidence = buildEvidence(inputs);
    const now = evidence.generatedAt;
    const investigation = inputs.investigation;
    const payload = {
      evidence,
      evidence_at: now,
    };
    const result = investigation
      ? await admin
          .from("ticket_investigations")
          .update(payload)
          .eq("ticket_id", ticketId)
          .eq("organization_id", organizationId)
      : await admin.from("ticket_investigations").insert({
          ticket_id: ticketId,
          organization_id: organizationId,
          user_id: (inputs.ticket as { user_id?: string }).user_id,
          context: {},
          hypotheses: [],
          excluded_steps: [],
          status: "open",
          ...payload,
        });
    if (result.error) throw result.error;
    return evidence;
  } catch (error) {
    console.error("Failed to snapshot evidence.", error);
    return null;
  }
}
