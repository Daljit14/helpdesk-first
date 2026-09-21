import { isDeviceAgentEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DiagnosticKind } from "@/lib/device-agent/protocol";
import type { DeviceEvidence } from "./types";

const DEVICE_WORDS =
  /\b(network|wi[\s-]?fi|vpn|dns|slow|disk|update|printer)\b/i;

export function isDeviceFamily(
  category: string | null,
  message: string
): boolean {
  return DEVICE_WORDS.test(`${category ?? ""} ${message}`);
}

export async function loadDeviceEvidence(
  admin: ReturnType<typeof createAdminClient>,
  input: { organizationId: string; requesterUserId: string | null | undefined }
): Promise<DeviceEvidence | undefined> {
  if (!isDeviceAgentEnabled() || !input.requesterUserId) return undefined;
  const device = await admin
    .from("devices_public")
    .select("id,platform,device_class")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.requesterUserId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (device.error || !device.data) return undefined;
  const diagnostics = await admin
    .from("device_diagnostics")
    .select("kind,ok,summary,data,collected_at")
    .eq("organization_id", input.organizationId)
    .eq("device_id", device.data.id)
    .order("collected_at", { ascending: false })
    .limit(9);
  if (diagnostics.error) return undefined;
  const rows = (diagnostics.data ?? []) as Array<{
    kind: DiagnosticKind;
    ok: boolean;
    summary: string;
    data: Record<string, string | number | boolean | null>;
    collected_at: string;
  }>;
  const latest = rows[0]?.collected_at ?? new Date(0).toISOString();
  return {
    deviceId: device.data.id,
    platform: device.data.platform,
    deviceClass: device.data.device_class,
    collectedAt: latest,
    diagnostics: rows.map((row) => ({
      kind: row.kind,
      ok: row.ok,
      summary: row.summary,
      data: row.data,
    })),
    stale: Date.now() - Date.parse(latest) > 24 * 60 * 60 * 1000,
  };
}
