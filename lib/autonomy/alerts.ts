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
  ticketId: string | null;
  runId: string | null;
  kind: string;
  detail?: Record<string, unknown>;
  dedupeKey?: string;
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
      input.ticketId
        ? admin
            .from("tickets")
            .select("issue_title")
            .eq("id", input.ticketId)
            .eq("organization_id", input.organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (members.error) throw members.error;
    const recipientUserIds = (members.data ?? []).map((row) => row.user_id);
    const message = buildNotification("security.autonomy_alert", {
      ticketTitle:
        ticket.data?.issue_title ??
        (input.kind === "audit_chain_broken"
          ? "Organization audit chain"
          : "A ticket"),
      ticketId: input.ticketId ?? "",
      status: input.kind,
    });
    const auditDetails =
      input.kind === "audit_chain_broken" ? (input.detail ?? {}) : {};
    const table =
      typeof auditDetails.table === "string" &&
      [
        "resolution_events",
        "agent_steps",
        "capability_autonomy_transitions",
      ].includes(auditDetails.table)
        ? auditDetails.table
        : "unknown";
    const id =
      typeof auditDetails.id === "string" ? auditDetails.id.slice(0, 100) : "";
    const reason =
      typeof auditDetails.reason === "string"
        ? auditDetails.reason.slice(0, 100)
        : "verification_failed";
    await enqueueNotification({
      organizationId: input.organizationId,
      ticketId: input.ticketId,
      eventType: "security.autonomy_alert",
      recipientUserIds,
      ...message,
      body:
        input.kind === "audit_chain_broken"
          ? `${message.body}\n\nTable: ${table}\nRecord: ${id}\nReason: ${reason}`
          : message.body,
      dedupeKey: input.dedupeKey ?? `autonomy:${input.runId}:${input.kind}`,
    });
  } catch (error) {
    if (input.runId && input.ticketId) {
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
    } else {
      console.error("requester agent security alert failed", {
        organizationId: input.organizationId,
        kind: input.kind,
      });
    }
  }
}
