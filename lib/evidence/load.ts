import { createAdminClient } from "@/lib/supabase/admin";
import { loadInvestigation } from "@/lib/investigation/load";
import type { EvidenceInputs } from "./build";
import { loadIdentityEvidence } from "./identity-family";
import { decryptInvestigationRow } from "@/lib/security/ticket-crypto";
import { decryptTicketRow } from "@/lib/security/ticket-crypto";
import { loadDeviceEvidence } from "./device-family";

type EvidenceClient = ReturnType<typeof createAdminClient>;

export async function loadEvidenceInputs(
  admin: EvidenceClient,
  ticketId: string,
  organizationId: string
): Promise<EvidenceInputs | null> {
  try {
    const ticketResult = await admin
      .from("tickets")
      .select("message,platform,issue_id,diagnostic_answers,user_id,category")
      .eq("organization_id", organizationId)
      .eq("id", ticketId)
      .maybeSingle();
    if (ticketResult.error) throw ticketResult.error;
    if (!ticketResult.data) return null;

    const [investigation, stepOutcomes, attachments, device] =
      await Promise.all([
        loadInvestigation(admin, ticketId, organizationId),
        admin
          .from("ticket_step_outcomes")
          .select("guide_slug,step_index,outcome,created_at")
          .eq("organization_id", organizationId)
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        admin
          .from("ticket_attachments")
          .select(
            "id,declared_mime,status,scan_verdict,page_count,width,height"
          )
          .eq("organization_id", organizationId)
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        loadDeviceEvidence(admin, {
          organizationId,
          requesterUserId: ticketResult.data.user_id,
        }),
      ]);
    if (stepOutcomes.error) throw stepOutcomes.error;
    if (attachments.error) throw attachments.error;
    const ticket = await decryptTicketRow(admin, {
      ...ticketResult.data,
      organization_id: organizationId,
    });
    const identity = await loadIdentityEvidence(admin, {
      runId: "",
      ticketId,
      organizationId,
      userId: ticketResult.data.user_id,
      category:
        (ticketResult.data as { category?: string | null }).category ?? null,
      message: ticket.message,
    });
    const loadedInvestigation = investigation?.investigation
      ? await decryptInvestigationRow(admin, investigation.investigation)
      : null;
    return {
      ticket: ticket as EvidenceInputs["ticket"],
      investigation: loadedInvestigation,
      turns: investigation?.turns ?? [],
      stepOutcomes: (stepOutcomes.data ?? []) as EvidenceInputs["stepOutcomes"],
      attachments: (attachments.data ?? []) as EvidenceInputs["attachments"],
      ...(identity ? { identity } : {}),
      ...(device ? { device } : {}),
    };
  } catch (error) {
    console.error("Failed to load evidence inputs.", error);
    return null;
  }
}
