import type { StepRef } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InvestigationRow, InvestigationTurnRow } from "./types";

type InvestigationClient = ReturnType<typeof createAdminClient>;

export async function loadFailedSteps(
  admin: InvestigationClient,
  ticketId: string
): Promise<StepRef[]> {
  const { data, error } = await admin
    .from("ticket_step_outcomes")
    .select("guide_slug, step_index")
    .eq("ticket_id", ticketId)
    .in("outcome", ["failed", "could_not_perform"]);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    if (
      typeof row.guide_slug !== "string" ||
      !Number.isInteger(row.step_index)
    ) {
      return [];
    }
    return [{ guideSlug: row.guide_slug, stepIndex: row.step_index }];
  });
}

export async function loadInvestigation(
  client: InvestigationClient,
  ticketId: string
): Promise<{
  investigation: InvestigationRow;
  turns: InvestigationTurnRow[];
} | null> {
  try {
    const investigation = await client
      .from("ticket_investigations")
      .select(
        "ticket_id,organization_id,user_id,context,hypotheses,excluded_steps,withheld_steps,status,escalation_package,escalation_package_at,created_at,updated_at"
      )
      .eq("ticket_id", ticketId)
      .maybeSingle();
    if (investigation.error) throw investigation.error;
    if (!investigation.data) return null;

    const turns = await client
      .from("ticket_investigation_turns")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false });
    if (turns.error) throw turns.error;
    return {
      investigation: investigation.data as InvestigationRow,
      turns: (turns.data ?? []) as InvestigationTurnRow[],
    };
  } catch (error) {
    console.error("Failed to load investigation.", error);
    return null;
  }
}
