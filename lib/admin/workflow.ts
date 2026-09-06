import type { AdminSession } from "./auth";
import { canAccessTicket } from "./auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function workflowTicket(session: AdminSession, ticketId: string) {
  const { data } = await createAdminClient()
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!data || !canAccessTicket(session, data)) return null;
  return data;
}
