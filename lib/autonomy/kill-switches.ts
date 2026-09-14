import { createAdminClient } from "@/lib/supabase/admin";
import { isAutonomyEnabled } from "./config";

type KillSwitchAdmin = ReturnType<typeof createAdminClient>;

type KillSwitchRow = {
  scope: "global" | "organization" | "capability";
  scope_id: string | null;
  reason: string | null;
};

export async function readKillSwitches(
  admin: KillSwitchAdmin,
  organizationId: string,
  capabilityId?: string
): Promise<{
  global: boolean;
  organization: boolean;
  capability: boolean;
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
    const capability = rows.some((row) => row.scope === "capability");
    for (const row of rows) {
      if (row.reason) reasons.push(row.reason);
    }
    return {
      global,
      organization,
      capability,
      anyActive: global || organization || capability,
      reasons,
    };
  } catch {
    return {
      global: true,
      organization: false,
      capability: false,
      anyActive: true,
      reasons: ["switch_read_failed"],
    };
  }
}
