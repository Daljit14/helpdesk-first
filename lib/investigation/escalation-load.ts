import { createAdminClient } from "@/lib/supabase/admin";
import { loadInvestigation } from "./load";
import type { EscalationInputs } from "./escalation";

type InvestigationClient = ReturnType<typeof createAdminClient>;

export async function loadEscalationInputs(
  admin: InvestigationClient,
  ticketId: string,
  organizationId: string
): Promise<EscalationInputs | null> {
  try {
    const ticketResult = await admin
      .from("tickets")
      .select(
        "id,user_id,message,issue_id,issue_title,category,priority,platform,diagnostic_answers,handoff_reason,escalation_reason,needs_human_at,escalated_at,ai_failed_attempts,ai_confidence"
      )
      .eq("organization_id", organizationId)
      .eq("id", ticketId)
      .maybeSingle();
    if (ticketResult.error) throw ticketResult.error;
    if (!ticketResult.data) return null;

    const [investigation, stepOutcomes, actions, member, attachments] =
      await Promise.all([
        loadInvestigation(admin, ticketId),
        admin
          .from("ticket_step_outcomes")
          .select("guide_slug,step_index,outcome,created_at")
          .eq("organization_id", organizationId)
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        admin
          .from("ticket_actions")
          .select("tool_name,action_summary,result_summary,created_at")
          .eq("organization_id", organizationId)
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        admin
          .from("organization_members")
          .select("role")
          .eq("organization_id", organizationId)
          .eq("user_id", ticketResult.data.user_id)
          .maybeSingle(),
        admin
          .from("ticket_attachments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("ticket_id", ticketId)
          .neq("status", "rejected")
          .neq("status", "deleted"),
      ]);
    if (stepOutcomes.error) throw stepOutcomes.error;
    if (actions.error) throw actions.error;
    if (member.error) throw member.error;
    if (attachments.error) throw attachments.error;

    return {
      ticket: ticketResult.data as EscalationInputs["ticket"],
      investigation: investigation?.investigation ?? null,
      turns: investigation?.turns ?? [],
      stepOutcomes: (stepOutcomes.data ??
        []) as EscalationInputs["stepOutcomes"],
      actions: (actions.data ?? []) as EscalationInputs["actions"],
      requesterRole:
        typeof member.data?.role === "string" ? member.data.role : null,
      attachmentCount: attachments.count ?? 0,
    };
  } catch (error) {
    console.error("Failed to load escalation inputs.", error);
    return null;
  }
}
