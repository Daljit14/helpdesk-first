import { isCapabilityRegistryEnabled } from "@/lib/admin/flags";
import type { createAdminClient } from "@/lib/supabase/admin";
import { readKillSwitches } from "../kill-switches";
import { capabilityEnvFlag, getCapability } from "./registry";

type Admin = ReturnType<typeof createAdminClient>;

type OrgCapabilityRow = { min_version: number; enabled: boolean };
type VersionStatusRow = { status: string };

export function isCapabilityEnvEnabled(id: string): boolean {
  return process.env[capabilityEnvFlag(id)] === "true";
}

export async function isCapabilityEnabled(
  admin: Admin,
  input: { organizationId: string; id: string; version: number }
): Promise<boolean> {
  const { organizationId, id, version } = input;
  if (!isCapabilityRegistryEnabled()) return false;
  if (!isCapabilityEnvEnabled(id)) return false;
  if (!getCapability(id, version)) return false;

  try {
    const { data: orgRow, error: orgError } = await admin
      .from("organization_capabilities")
      .select("min_version,enabled")
      .eq("organization_id", organizationId)
      .eq("capability_id", id)
      .maybeSingle();
    if (orgError) return false;
    const org = (orgRow ?? null) as OrgCapabilityRow | null;
    if (!org || !org.enabled || org.min_version > version) return false;

    const { data: versionRow, error: versionError } = await admin
      .from("capability_versions")
      .select("status")
      .eq("capability_id", id)
      .eq("version", version)
      .maybeSingle();
    if (versionError) return false;
    const ver = (versionRow ?? null) as VersionStatusRow | null;
    if (!ver || ver.status !== "active") return false;

    const switches = await readKillSwitches(admin, organizationId, id);
    if (switches.anyActive) return false;
    return true;
  } catch {
    return false;
  }
}

export async function listEnabledCapabilities(
  admin: Admin,
  organizationId: string
): Promise<{ id: string; version: number }[]> {
  if (!isCapabilityRegistryEnabled()) return [];
  const { data, error } = await admin
    .from("organization_capabilities")
    .select("capability_id,min_version,enabled")
    .eq("organization_id", organizationId)
    .eq("enabled", true);
  if (error) return [];
  const rows = (data ?? []) as {
    capability_id: string;
    min_version: number;
  }[];
  const out: { id: string; version: number }[] = [];
  for (const row of rows) {
    if (!isCapabilityEnvEnabled(row.capability_id)) continue;
    const def = getCapability(row.capability_id, 1);
    if (!def || def.version < row.min_version) continue;
    if (
      await isCapabilityEnabled(admin, {
        organizationId,
        id: def.id,
        version: def.version,
      })
    ) {
      out.push({ id: def.id, version: def.version });
    }
  }
  return out;
}
