import { createAdminClient } from "@/lib/supabase/admin";

export async function event(
  ticketId: string,
  organizationId: string | null,
  eventType: string,
  actorType: "user" | "ai" | "employee" | "system",
  actorId: string | null,
  detail: Record<string, unknown> = {}
) {
  await createAdminClient().from("ticket_system_events").insert({
    ticket_id: ticketId,
    organization_id: organizationId,
    event_type: eventType,
    actor_type: actorType,
    actor_id: actorId,
    detail,
  });
}
