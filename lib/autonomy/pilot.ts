import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPilotCapabilityAllowlist,
  getPilotLimits,
  getPilotOrgAllowlist,
} from "./config";

type PilotAdmin = ReturnType<typeof createAdminClient>;

export type PilotDenial =
  | "pilot_org_not_allowlisted"
  | "pilot_capability_not_allowlisted"
  | "pilot_capability_risk"
  | "pilot_daily_limit"
  | "pilot_org_daily_limit";

function utcStart(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

export async function checkPilotEligibility(
  admin: PilotAdmin,
  input: {
    organizationId: string;
    capability: { id: string; version: number; riskLevel: string };
  }
): Promise<{ ok: true } | { ok: false; code: PilotDenial }> {
  if (!getPilotOrgAllowlist().includes(input.organizationId))
    return { ok: false, code: "pilot_org_not_allowlisted" };
  const capabilities = getPilotCapabilityAllowlist();
  if (capabilities && !capabilities.includes(input.capability.id))
    return { ok: false, code: "pilot_capability_not_allowlisted" };
  if (!capabilities && input.capability.riskLevel !== "safe")
    return { ok: false, code: "pilot_capability_risk" };

  try {
    const since = utcStart();
    const [global, organization] = await Promise.all([
      admin
        .from("capability_executions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      admin
        .from("capability_executions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", input.organizationId)
        .gte("created_at", since),
    ]);
    if (global.error || organization.error)
      return { ok: false, code: "pilot_daily_limit" };
    const limits = getPilotLimits();
    if ((global.count ?? 0) >= limits.globalDaily)
      return { ok: false, code: "pilot_daily_limit" };
    if ((organization.count ?? 0) >= limits.orgDaily)
      return { ok: false, code: "pilot_org_daily_limit" };
    return { ok: true };
  } catch {
    return { ok: false, code: "pilot_daily_limit" };
  }
}
