import type { createAdminClient } from "@/lib/supabase/admin";
import { CAPABILITIES, capabilityChecksum, inputSchemaJson } from "./registry";

type Admin = ReturnType<typeof createAdminClient>;

type VersionRow = {
  capability_id: string;
  version: number;
  checksum: string;
  status: "active" | "deprecated" | "revoked";
};

export type SyncResult = {
  inserted: number;
  updated: number;
  deprecated: number;
  conflicts: string[];
};

export async function syncCapabilityRegistry(
  admin: Admin
): Promise<SyncResult> {
  const result: SyncResult = {
    inserted: 0,
    updated: 0,
    deprecated: 0,
    conflicts: [],
  };
  const now = new Date().toISOString();

  const baseRows = CAPABILITIES.map((def) => ({
    id: def.id,
    department: def.department,
    description: def.description,
    side_effects: def.sideEffects,
    owner: def.owner,
    review_date: def.reviewDate,
    updated_at: now,
  }));
  const { error: baseError } = await admin
    .from("capabilities")
    .upsert(baseRows, { onConflict: "id" });
  if (baseError) throw baseError;

  const { data: existingData, error: readError } = await admin
    .from("capability_versions")
    .select("capability_id,version,checksum,status");
  if (readError) throw readError;
  const existing = new Map<string, VersionRow>();
  for (const row of (existingData ?? []) as VersionRow[]) {
    existing.set(`${row.capability_id}:${row.version}`, row);
  }

  const codeKeys = new Set<string>();
  for (const def of CAPABILITIES) {
    const key = `${def.id}:${def.version}`;
    codeKeys.add(key);
    const checksum = capabilityChecksum(def);
    const current = existing.get(key);
    if (current && current.checksum !== checksum) {
      result.conflicts.push(`${def.id}@${def.version}`);
      continue;
    }
    if (current && current.status === "active") continue;
    const row = {
      capability_id: def.id,
      version: def.version,
      platforms: def.platforms,
      risk_level: def.riskLevel,
      consent: def.consent,
      org_policy_requirements: def.orgPolicyRequirements,
      max_runtime_ms: def.maxRuntimeMs,
      expected_result: def.expectedResult,
      verification: def.verification,
      rollback: def.rollback,
      input_schema: inputSchemaJson(def),
      checksum,
      status: "active" as const,
      updated_at: now,
    };
    if (!current) {
      const { error } = await admin.from("capability_versions").insert(row);
      if (error) throw error;
      result.inserted += 1;
    } else {
      const { error } = await admin
        .from("capability_versions")
        .update({ status: "active", updated_at: now })
        .eq("capability_id", def.id)
        .eq("version", def.version);
      if (error) throw error;
      result.updated += 1;
    }
  }

  for (const [key, row] of existing) {
    if (codeKeys.has(key) || row.status !== "active") continue;
    const { error } = await admin
      .from("capability_versions")
      .update({ status: "deprecated", updated_at: now })
      .eq("capability_id", row.capability_id)
      .eq("version", row.version);
    if (error) throw error;
    result.deprecated += 1;
  }

  return result;
}
