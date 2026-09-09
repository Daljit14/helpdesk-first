import type { StepRef } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";

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
): Promise<{ investigation: unknown; turns: unknown[] } | null> {
  const investigation = await client
    .from("ticket_investigations")
    .select("*")
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
  return { investigation: investigation.data, turns: turns.data ?? [] };
}
