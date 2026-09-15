import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPlannerProvider,
  isAutonomyEnabled,
  isCapabilityDisabledByEnv,
  isProviderDisabledByEnv,
} from "./config";

type KillSwitchAdmin = ReturnType<typeof createAdminClient>;

type KillSwitchRow = {
  scope: "global" | "organization" | "capability" | "provider";
  scope_id: string | null;
  reason: string | null;
};

export async function readKillSwitches(
  admin: KillSwitchAdmin,
  organizationId: string,
  capabilityId?: string,
  providerId = getPlannerProvider()
): Promise<{
  global: boolean;
  organization: boolean;
  capability: boolean;
  provider: boolean;
  anyActive: boolean;
  reasons: string[];
}> {
  const reasons: string[] = [];
  const globalByEnv = !isAutonomyEnabled();
  if (globalByEnv) reasons.push("autonomy_disabled");

  const clauses = [
    "scope.eq.global",
    `and(scope.eq.organization,scope_id.eq.${organizationId})`,
  ];
  if (capabilityId) {
    clauses.push(`and(scope.eq.capability,scope_id.eq.${capabilityId})`);
  }
  clauses.push(`and(scope.eq.provider,scope_id.eq.${providerId})`);
  const capabilityByEnv = capabilityId
    ? isCapabilityDisabledByEnv(capabilityId)
    : false;
  const providerByEnv = isProviderDisabledByEnv(providerId);
  if (capabilityByEnv) reasons.push("capability_env_disabled");
  if (providerByEnv) reasons.push("provider_env_disabled");

  try {
    const { data, error } = await admin
      .from("ai_kill_switches")
      .select("scope,scope_id,reason")
      .eq("enabled", true)
      .or(clauses.join(","));
    if (error) throw error;
    const rows = (data ?? []) as KillSwitchRow[];
    const global = globalByEnv || rows.some((row) => row.scope === "global");
    const organization = rows.some((row) => row.scope === "organization");
    const capability =
      capabilityByEnv || rows.some((row) => row.scope === "capability");
    const provider =
      providerByEnv || rows.some((row) => row.scope === "provider");
    for (const row of rows) {
      if (row.reason) reasons.push(row.reason);
    }
    return {
      global,
      organization,
      capability,
      provider,
      anyActive: global || organization || capability || provider,
      reasons,
    };
  } catch {
    return {
      global: true,
      organization: false,
      capability: capabilityByEnv,
      provider: providerByEnv,
      anyActive: true,
      reasons: [
        "switch_read_failed",
        ...(capabilityByEnv ? ["capability_env_disabled"] : []),
        ...(providerByEnv ? ["provider_env_disabled"] : []),
      ],
    };
  }
}

export type SetKillSwitchInput = {
  scope: "global" | "organization" | "capability" | "provider";
  scopeId: string | null;
  enabled: boolean;
  reason?: string | null;
  setBy: string | null;
  organizationId: string | null;
};

export async function setKillSwitch(
  admin: KillSwitchAdmin,
  input: SetKillSwitchInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    let query = admin
      .from("ai_kill_switches")
      .select("id")
      .eq("scope", input.scope);
    if (input.scopeId === null) query = query.is("scope_id", null);
    else query = query.eq("scope_id", input.scopeId);
    if (input.scope === "organization" && input.organizationId) {
      query = query.eq("organization_id", input.organizationId);
    }
    const existing = await query.maybeSingle();
    if (existing.error) return { ok: false, error: existing.error.message };
    const values = {
      organization_id: input.organizationId,
      scope: input.scope,
      scope_id: input.scopeId,
      enabled: input.enabled,
      reason: input.reason ?? null,
      set_by: input.setBy,
      set_at: new Date().toISOString(),
    };
    if (existing.data?.id) {
      const updated = await admin
        .from("ai_kill_switches")
        .update(values)
        .eq("id", existing.data.id);
      return updated.error
        ? { ok: false, error: updated.error.message }
        : { ok: true };
    }
    const inserted = await admin.from("ai_kill_switches").insert(values);
    return inserted.error
      ? { ok: false, error: inserted.error.message }
      : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "kill switch write failed",
    };
  }
}
