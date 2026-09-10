import { isEscalationPackageEnabled } from "@/lib/investigation/config";
import {
  snapshotEscalationPackage,
  summarizeEscalationPackage,
} from "@/lib/investigation/escalation";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyEmployeesOfHandoff } from "./notify";

export async function completeUserHandoff(ticketId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select(
      "id,organization_id,issue_title,priority,human_response_due_at,user_id"
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return;

  const packageSnapshot =
    isEscalationPackageEnabled() && ticket.organization_id
      ? await snapshotEscalationPackage(admin, ticketId, ticket.organization_id)
      : null;
  await notifyEmployeesOfHandoff(ticket.organization_id, {
    id: ticketId,
    issue_title: ticket.issue_title,
    priority: ticket.priority,
    human_response_due_at: ticket.human_response_due_at,
    diagnosis: packageSnapshot
      ? summarizeEscalationPackage(packageSnapshot)
      : undefined,
  });
}
