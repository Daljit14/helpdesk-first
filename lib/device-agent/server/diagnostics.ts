import { createAdminClient } from "@/lib/supabase/admin";
import { redactAuditDetail } from "@/lib/autonomy/audit/redact";
import { toTicketId } from "@/lib/operations/transform";
import {
  diagnosticsBatchSchema,
  type DiagnosticsBatch,
} from "@/lib/device-agent/protocol";
import type { DeviceRow } from "./auth";

export async function storeDiagnostics(
  admin: ReturnType<typeof createAdminClient>,
  device: DeviceRow,
  batch: DiagnosticsBatch
): Promise<void> {
  const parsed = diagnosticsBatchSchema.parse(batch);
  let ticketId: string | null = null;
  if (parsed.ticketReference && device.user_id) {
    const ticket = await admin
      .from("tickets")
      .select("id")
      .eq("organization_id", device.organization_id)
      .eq("user_id", device.user_id)
      .limit(1000);
    if (ticket.error) throw ticket.error;
    const match = (ticket.data as Array<{ id: string }> | null)?.find(
      (row) => toTicketId(row.id) === parsed.ticketReference
    );
    ticketId = match?.id ?? null;
  }
  const rows = parsed.records.map((record) => ({
    organization_id: device.organization_id,
    device_id: device.id,
    ticket_id: ticketId,
    kind: record.kind,
    ok: record.ok,
    summary: redactAuditDetail({ summary: record.summary }).summary ?? "",
    data: redactAuditDetail(record.data),
    collected_at: record.collectedAt,
  }));
  const result = await admin.from("device_diagnostics").insert(rows);
  if (result.error) throw result.error;
}

export async function latestDiagnostics(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  deviceId: string,
  kinds?: string[]
): Promise<unknown[]> {
  let query = admin
    .from("device_diagnostics")
    .select("kind,ok,summary,data,collected_at")
    .eq("organization_id", organizationId)
    .eq("device_id", deviceId)
    .order("collected_at", { ascending: false })
    .limit(20);
  if (kinds?.length) query = query.in("kind", kinds);
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}
