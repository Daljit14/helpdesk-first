import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const ID_TABLES: Record<string, string> = {
  notificationId: "notification_outbox",
  attachmentId: "ticket_attachments",
};

export type TenantCheckResult = { ok: true } | { ok: false; reason: string };

export async function checkTenant(
  admin: Admin,
  organizationId: string,
  ticketId: string,
  params: Record<string, unknown>
): Promise<TenantCheckResult> {
  for (const [key, value] of Object.entries(params)) {
    if (!key.endsWith("Id")) continue;
    if (typeof value !== "string" || value.length === 0) {
      return { ok: false, reason: `invalid_${key}` };
    }
    if (key === "ticketId") {
      if (value !== ticketId) return { ok: false, reason: "ticket_mismatch" };
      continue;
    }
    if (key === "questionId") continue;
    const table = ID_TABLES[key];
    if (!table) return { ok: false, reason: `unknown_id:${key}` };
    const result = await admin
      .from(table)
      .select("id")
      .eq("id", value)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (result.error || !result.data) {
      return { ok: false, reason: `tenant_mismatch:${key}` };
    }
  }
  return { ok: true };
}
