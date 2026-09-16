import { createAdminClient } from "@/lib/supabase/admin";
import { buildNotification } from "@/lib/notifications/templates";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { redactAuditDetail } from "./audit/redact";
import { auditVersions } from "./audit/versions";
import { isAutonomyAlertsEnabled } from "./config";

type AlertAdmin = ReturnType<typeof createAdminClient>;

export function isAlertingConfigured(): boolean {
  return Boolean(
    process.env.BREVO_API_KEY && process.env.NOTIFICATIONS_FROM_EMAIL
  );
}

export type SecurityAlertInput = {
  organizationId: string;
  ticketId: string;
  runId: string;
  kind: string;
  detail?: Record<string, unknown>;
};

export async function alertSecurityEvent(
  admin: AlertAdmin,
  input: SecurityAlertInput
): Promise<void> {
  if (!isAutonomyAlertsEnabled()) return;
  try {
    const [members, ticket] = await Promise.all([
      admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", input.organizationId)
        .in("role", ["org_admin", "admin"]),
      admin
        .from("tickets")
        .select("issue_title")
        .eq("id", input.ticketId)
        .eq("organization_id", input.organizationId)
        .maybeSingle(),
    ]);
    if (members.error) throw members.error;
    const recipientUserIds = (members.data ?? []).map((row) => row.user_id);
    const message = buildNotification("security.autonomy_alert", {
      ticketTitle: ticket.data?.issue_title ?? "A ticket",
      ticketId: input.ticketId,
      status: input.kind,
    });
    await enqueueNotification({
      organizationId: input.organizationId,
      ticketId: input.ticketId,
      eventType: "security.autonomy_alert",
      recipientUserIds,
      ...message,
      dedupeKey: `autonomy:${input.runId}:${input.kind}`,
    });
  } catch (error) {
    await admin.from("resolution_events").insert({
      organization_id: input.organizationId,
      run_id: input.runId,
      ticket_id: input.ticketId,
      kind: "alert.failed",
      actor: "orchestrator",
      detail: redactAuditDetail({
        kind: input.kind,
        error: error instanceof Error ? error.message : "alert failed",
        detail: input.detail ?? {},
      }),
      initiated_by: "ai",
      versions: auditVersions(),
    });
  }
}
