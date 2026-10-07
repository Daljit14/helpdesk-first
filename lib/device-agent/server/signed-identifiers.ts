import { isDeviceSignedTrustEnabled } from "@/lib/admin/flags";
import {
  DEVICE_SIGNED_IDENTIFIER_FIELDS,
  signedIdentifiersFromRecord,
} from "@/lib/device-agent/diagnostic-data";
import { findActiveDeviceForUser } from "./jobs";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function loadSignedDeviceIdentifiers(
  admin: Admin,
  input: {
    organizationId: string;
    requesterId: string;
    platform: string | null | undefined;
    now?: number;
  }
): Promise<{ deviceId: string; identifiers: string[] } | null> {
  if (!isDeviceSignedTrustEnabled() || !input.platform) return null;
  try {
    const device = await findActiveDeviceForUser(admin, {
      organizationId: input.organizationId,
      userId: input.requesterId,
      platform: input.platform,
    });
    if (!device) return null;
    const cutoff = new Date((input.now ?? Date.now()) - 24 * 60 * 60 * 1000);
    const result = await admin
      .from("device_diagnostics")
      .select("kind,data,collected_at")
      .eq("organization_id", input.organizationId)
      .eq("device_id", device.id)
      .in("kind", Object.keys(DEVICE_SIGNED_IDENTIFIER_FIELDS))
      .gte("collected_at", cutoff.toISOString())
      .order("collected_at", { ascending: false })
      .limit(20);
    if (result.error) return null;

    const identifiers = new Set<string>();
    const seenKinds = new Set<string>();
    const rows = (result.data ?? []) as Array<{
      kind: string;
      data: unknown;
      collected_at: string;
    }>;
    rows
      .slice()
      .sort(
        (left, right) =>
          Date.parse(right.collected_at) - Date.parse(left.collected_at)
      )
      .forEach((row) => {
        if (seenKinds.has(row.kind)) return;
        seenKinds.add(row.kind);
        for (const identifier of signedIdentifiersFromRecord(
          row.kind,
          row.data
        ))
          identifiers.add(identifier);
      });
    return { deviceId: device.id, identifiers: [...identifiers] };
  } catch {
    return null;
  }
}
