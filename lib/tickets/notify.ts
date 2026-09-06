import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

export async function notifyEmployeesOfHandoff(
  organizationId: string,
  ticket: {
    id: string;
    issue_title: string;
    priority: string;
    human_response_due_at?: string | null;
  }
): Promise<void> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "support_agent"]);
  const due = ticket.human_response_due_at
    ? new Date(ticket.human_response_due_at).toLocaleString()
    : "soon";
  for (const member of members ?? []) {
    try {
      await sendPushToUser(member.user_id, {
        title: "Ticket needs a human",
        body: `${ticket.issue_title} · ${ticket.priority} · respond by ${due}`,
        url: `/admin/tickets/${ticket.id}`,
      });
    } catch (error) {
      console.warn("Unable to notify employee of ticket handoff.", error);
    }
  }
}

export async function notifyOverdueTickets(
  organizationId: string
): Promise<void> {
  const admin = createAdminClient();
  const { data: tickets } = await admin
    .from("tickets")
    .select("id,user_id,issue_title,overdue_notified_at")
    .eq("organization_id", organizationId)
    .is("overdue_notified_at", null)
    .not("human_response_due_at", "is", null)
    .is("first_human_response_at", null)
    .lt("human_response_due_at", new Date().toISOString());
  const { data: admins } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "admin");
  for (const ticket of tickets ?? []) {
    for (const member of admins ?? []) {
      try {
        await sendPushToUser(member.user_id, {
          title: "Ticket SLA overdue",
          body: `${ticket.issue_title} needs attention.`,
          url: `/admin/tickets/${ticket.id}`,
        });
      } catch (error) {
        console.warn("Unable to notify admin of overdue ticket.", error);
      }
    }
    await admin
      .from("tickets")
      .update({ overdue_notified_at: new Date().toISOString() })
      .eq("id", ticket.id)
      .eq("organization_id", organizationId);
  }
}
