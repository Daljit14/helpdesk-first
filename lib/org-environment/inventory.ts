import { sanitizeServiceText } from "@/lib/service-health/url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/helpdesk-data";

export type InventorySuggestions = {
  deviceCount: number;
  platforms: Array<{ platform: Platform; count: number }>;
  printers: string[];
};

const emptySuggestions: InventorySuggestions = {
  deviceCount: 0,
  platforms: [],
  printers: [],
};

function inventoryPlatform(value: string): Platform | null {
  if (value === "windows") return "Windows";
  if (value === "macos") return "Mac";
  if (value === "linux") return "Other";
  return null;
}

export function suggestFromInventory(
  devices: { platform: string }[],
  printerDiagnostics: { data: Record<string, unknown> }[]
): InventorySuggestions {
  const platformCounts = new Map<Platform, number>();
  for (const device of devices) {
    const platform = inventoryPlatform(device.platform);
    if (platform)
      platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
  }
  const platforms = [...platformCounts.entries()]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));

  const printerCounts = new Map<string, number>();
  for (const diagnostic of printerDiagnostics) {
    const names = diagnostic.data.names;
    if (!Array.isArray(names)) continue;
    for (const value of names) {
      if (typeof value !== "string") continue;
      const name = sanitizeServiceText(value, 80);
      if (name) printerCounts.set(name, (printerCounts.get(name) ?? 0) + 1);
    }
  }
  const printers = [...printerCounts.entries()]
    .sort(([leftName, leftCount], [rightName, rightCount]) => {
      return rightCount - leftCount || leftName.localeCompare(rightName);
    })
    .slice(0, 20)
    .map(([name]) => name);

  return { deviceCount: devices.length, platforms, printers };
}

export async function loadInventorySuggestions(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string
): Promise<InventorySuggestions> {
  try {
    const [devices, diagnostics] = await Promise.all([
      admin
        .from("devices_public")
        .select("platform")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      admin
        .from("device_diagnostics")
        .select("device_id,ok,data,collected_at")
        .eq("organization_id", organizationId)
        .eq("kind", "printers")
        .order("collected_at", { ascending: false })
        .limit(500),
    ]);
    if (devices.error || diagnostics.error) return emptySuggestions;

    const latestPrintersByDevice = new Map<
      string,
      { data: Record<string, unknown>; ok: boolean }
    >();
    for (const row of diagnostics.data ?? []) {
      if (!latestPrintersByDevice.has(row.device_id)) {
        latestPrintersByDevice.set(row.device_id, {
          data: row.data as Record<string, unknown>,
          ok: row.ok,
        });
      }
    }
    const printerDiagnostics = [...latestPrintersByDevice.values()]
      .filter((row) => row.ok)
      .map(({ data }) => ({ data }));
    return suggestFromInventory(
      (devices.data ?? []).map((device) => ({
        platform: device.platform,
      })),
      printerDiagnostics
    );
  } catch {
    return emptySuggestions;
  }
}
