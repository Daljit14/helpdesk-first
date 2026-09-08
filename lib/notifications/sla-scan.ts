import { createAdminClient } from "@/lib/supabase/admin";
import { buildNotification } from "./templates";
import { enqueueNotification } from "./enqueue";
import { getSiteUrl } from "@/lib/site-url";

type Ticket = {
  id: string;
  organization_id: string;
  user_id: string;
  issue_title: string;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  human_response_due_at: string | null;
  resolution_due_at: string | null;
  sla_risk_notified_at: string | null;
  overdue_notified_at: string | null;
  resolution_overdue_notified_at: string | null;
  first_human_response_at: string | null;
};

async function recipients(
  ticket: Ticket,
  admin: ReturnType<typeof createAdminClient>
): Promise<string[]> {
  if (ticket.assigned_agent_id) return [ticket.assigned_agent_id];
  const { data } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", ticket.organization_id)
    .in("role", ["admin", "org_admin", "support_agent"]);
  return (data ?? []).map((row) => row.user_id);
}

async function orgStaff(
  ticket: Ticket,
  admin: ReturnType<typeof createAdminClient>
): Promise<string[]> {
  const { data } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", ticket.organization_id)
    .in("role", ["admin", "org_admin", "support_agent"]);
  return (data ?? []).map((row) => row.user_id);
}

export async function scanSla(): Promise<{
  atRisk: number;
  firstResponseOverdue: number;
  resolutionOverdue: number;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tickets")
    .select(
      "id,organization_id,user_id,issue_title,status,priority,assigned_agent_id,human_response_due_at,resolution_due_at,sla_risk_notified_at,overdue_notified_at,resolution_overdue_notified_at,first_human_response_at"
    )
    .not("status", "in", '("Resolved","Closed")');
  let atRisk = 0;
  let firstResponseOverdue = 0;
  let resolutionOverdue = 0;
  const now = Date.now();
  for (const ticket of (data ?? []) as Ticket[]) {
    const due = ticket.human_response_due_at
      ? new Date(ticket.human_response_due_at).getTime()
      : null;
    const resolutionDue = ticket.resolution_due_at
      ? new Date(ticket.resolution_due_at).getTime()
      : null;
    if (
      due !== null &&
      due > now &&
      due <= now + 10 * 60_000 &&
      !ticket.first_human_response_at &&
      !ticket.sla_risk_notified_at
    ) {
      const eventType = "sla.first_response_at_risk" as const;
      const message = buildNotification(eventType, {
        ticketTitle: ticket.issue_title,
        ticketId: ticket.id,
        status: ticket.status,
      });
      await enqueueNotification({
        organizationId: ticket.organization_id,
        ticketId: ticket.id,
        eventType,
        recipientUserIds: await recipients(ticket, admin),
        ...message,
        url: `${getSiteUrl()}/admin/tickets/${ticket.id}`,
        dedupeKey: `${eventType}:${ticket.id}:${ticket.human_response_due_at}`,
      });
      await admin
        .from("tickets")
        .update({ sla_risk_notified_at: new Date().toISOString() })
        .eq("id", ticket.id);
      atRisk++;
    }
    if (
      due !== null &&
      due < now &&
      !ticket.first_human_response_at &&
      !ticket.overdue_notified_at
    ) {
      const eventType = "sla.first_response_overdue" as const;
      const message = buildNotification(eventType, {
        ticketTitle: ticket.issue_title,
        ticketId: ticket.id,
        status: ticket.status,
      });
      await enqueueNotification({
        organizationId: ticket.organization_id,
        ticketId: ticket.id,
        eventType,
        recipientUserIds: await orgStaff(ticket, admin),
        ...message,
        url: `${getSiteUrl()}/admin/tickets/${ticket.id}`,
        dedupeKey: `${eventType}:${ticket.id}:${ticket.human_response_due_at}`,
      });
      await admin
        .from("tickets")
        .update({ overdue_notified_at: new Date().toISOString() })
        .eq("id", ticket.id);
      firstResponseOverdue++;
    }
    if (
      resolutionDue !== null &&
      resolutionDue < now &&
      !ticket.resolution_overdue_notified_at
    ) {
      const eventType = "sla.resolution_overdue" as const;
      const message = buildNotification(eventType, {
        ticketTitle: ticket.issue_title,
        ticketId: ticket.id,
        status: ticket.status,
      });
      await enqueueNotification({
        organizationId: ticket.organization_id,
        ticketId: ticket.id,
        eventType,
        recipientUserIds: await orgStaff(ticket, admin),
        ...message,
        url: `${getSiteUrl()}/admin/tickets/${ticket.id}`,
        dedupeKey: `${eventType}:${ticket.id}:${ticket.resolution_due_at}`,
      });
      await admin
        .from("tickets")
        .update({ resolution_overdue_notified_at: new Date().toISOString() })
        .eq("id", ticket.id);
      resolutionOverdue++;
    }
  }
  return { atRisk, firstResponseOverdue, resolutionOverdue };
}
