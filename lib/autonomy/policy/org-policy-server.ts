import type { createAdminClient } from "@/lib/supabase/admin";
import { isOrgActionPolicyEnabled } from "@/lib/admin/flags";
import { checkRequesterEmailForOrg } from "@/lib/autonomy/connectors/binding";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";
import type { AutonomyTier } from "@/lib/autonomy/ladder";
import {
  evaluateOrgPolicy,
  orgActionPolicyRuleSchema,
  orgPolicyCeiling,
  type OrgActionPolicyRule,
  type OrgPolicyDecision,
} from "./org-policy";

type Admin = ReturnType<typeof createAdminClient>;

const GROUP_CACHE_TTL_MS = 15 * 60_000;
const groupCache = new Map<string, { groups: string[]; expiresAt: number }>();

function unavailableDecision(): OrgPolicyDecision {
  return {
    allowed: false,
    governed: true,
    effectiveMaxTier: "disabled",
    requireStaffApproval: false,
    reasons: ["org_policy_denied"],
  };
}

async function readRules(
  admin: Admin,
  organizationId: string,
  capabilityId: string
): Promise<OrgActionPolicyRule[]> {
  const result = await admin
    .from("org_action_policies")
    .select(
      "id,capability_id,effect,scope_groups,max_tier,autorun_windows,require_staff_approval"
    )
    .eq("organization_id", organizationId)
    .in("capability_id", [capabilityId, "*"]);
  if (result.error) throw new Error("org_policy_read_failed");
  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const parsed = orgActionPolicyRuleSchema.safeParse({
      id: row.id,
      capabilityId: row.capability_id,
      effect: row.effect,
      scopeGroups: row.scope_groups,
      maxTier: row.max_tier,
      autorunWindows: row.autorun_windows,
      requireStaffApproval: row.require_staff_approval,
    });
    if (!parsed.success) throw new Error("org_policy_row_invalid");
    return parsed.data as OrgActionPolicyRule;
  });
}

async function loadRequesterGroups(
  admin: Admin,
  input: {
    organizationId: string;
    subjectUserId: string | null;
    now: Date;
  }
): Promise<string[] | null> {
  if (!input.subjectUserId) return null;
  const cacheKey = `${input.organizationId}:${input.subjectUserId}`;
  const cached = groupCache.get(cacheKey);
  if (cached && cached.expiresAt > input.now.getTime())
    return [...cached.groups];
  if (cached) groupCache.delete(cacheKey);

  const loaded = await loadDirectoryForOrganization(
    admin,
    input.organizationId
  );
  if (!loaded || loaded.config.provider === "google") return null;
  const requester = await checkRequesterEmailForOrg(
    admin,
    input.organizationId,
    input.subjectUserId
  );
  if (!requester.ok) return null;
  const signal = AbortSignal.timeout(8_000);
  try {
    const account = await loaded.directory.lookupUserByEmail(
      requester.email,
      signal
    );
    if (
      !account.ok ||
      account.value.primaryEmail.trim().toLowerCase() !==
        requester.email.trim().toLowerCase()
    )
      return null;
    const status = await loaded.directory.getUserById(
      account.value.directoryUserId,
      signal
    );
    if (
      !status.ok ||
      status.value.directoryUserId !== account.value.directoryUserId ||
      status.value.primaryEmail.trim().toLowerCase() !==
        requester.email.trim().toLowerCase() ||
      !Array.isArray(account.value.groups) ||
      !account.value.groups.every((group) => typeof group === "string") ||
      !Array.isArray(status.value.groups) ||
      !status.value.groups.every((group) => typeof group === "string")
    )
      return null;
    const groups = [
      ...new Set([...account.value.groups, ...status.value.groups]),
    ];
    groupCache.set(cacheKey, {
      groups,
      expiresAt: input.now.getTime() + GROUP_CACHE_TTL_MS,
    });
    return [...groups];
  } catch {
    return null;
  }
}

export async function loadOrgPolicyDecision(
  admin: Admin,
  input: {
    organizationId: string;
    capabilityId: string;
    subjectUserId: string | null;
    tier: AutonomyTier;
    now: Date;
  }
): Promise<OrgPolicyDecision | null> {
  if (!isOrgActionPolicyEnabled()) return null;
  let rules: OrgActionPolicyRule[];
  try {
    rules = await readRules(admin, input.organizationId, input.capabilityId);
  } catch {
    console.error("organization action policy could not be loaded");
    return unavailableDecision();
  }
  const relevant = rules.filter(
    (rule) =>
      rule.capabilityId === input.capabilityId || rule.capabilityId === "*"
  );
  const needsGroups = relevant.some((rule) => rule.scopeGroups.length > 0);
  let requesterGroups: string[] | null = [];
  if (needsGroups) {
    try {
      requesterGroups = await loadRequesterGroups(admin, input);
    } catch {
      requesterGroups = null;
    }
  }
  return evaluateOrgPolicy({
    rules,
    capabilityId: input.capabilityId,
    requesterGroups,
    tier: input.tier,
    now: input.now,
  });
}

export async function loadOrgPolicyCeiling(
  admin: Admin,
  input: { organizationId: string; capabilityId: string }
): Promise<AutonomyTier | null> {
  if (!isOrgActionPolicyEnabled()) return null;
  try {
    const rules = await readRules(
      admin,
      input.organizationId,
      input.capabilityId
    );
    return orgPolicyCeiling(rules, input.capabilityId);
  } catch {
    console.error("organization action policy ceiling could not be loaded");
    return "disabled";
  }
}

export function __resetOrgPolicyGroupCache(): void {
  groupCache.clear();
}
