import type { createAdminClient } from "@/lib/supabase/admin";
import {
  getCapability,
  listCapabilities,
} from "@/lib/autonomy/capabilities/registry";
import { isCapabilityEnabled } from "@/lib/autonomy/capabilities/enablement";
import { isDenylisted } from "./denylist";
import { isSnapshotReversible, readTier } from "@/lib/autonomy/ladder";
import { isOrgActionPolicyEnabled } from "@/lib/admin/flags";
import { loadOrgPolicyCeiling } from "@/lib/autonomy/policy/org-policy-server";
import { updateSession, writeStep } from "./session";
import type { AgentSession } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export async function autorunCoveredCapabilities(
  admin: Admin,
  organizationId: string
): Promise<string[]> {
  const covered: string[] = [];
  for (const capability of listCapabilities()) {
    if (capability.sideEffects === "read_only") continue;
    if (isDenylisted(capability.id, capability)) continue;
    if (!isSnapshotReversible(capability)) continue;
    if (
      !(await isCapabilityEnabled(admin, {
        organizationId,
        id: capability.id,
        version: capability.version,
      }))
    )
      continue;
    if ((await readTier(admin, organizationId, capability.id)) !== "autorun")
      continue;
    if (isOrgActionPolicyEnabled()) {
      const ceiling = await loadOrgPolicyCeiling(admin, {
        organizationId,
        capabilityId: capability.id,
      });
      if (ceiling !== "autorun") continue;
    }
    covered.push(capability.id);
  }
  return covered;
}

export function sessionConsentActive(
  session: AgentSession,
  now = Date.now()
): boolean {
  return Boolean(
    session.autorun_consent_granted_at &&
    !session.autorun_consent_revoked_at &&
    session.autorun_consent_expires_at &&
    Date.parse(session.autorun_consent_expires_at) > now
  );
}

function consentTtlMs(): number {
  const value = Number(
    process.env.HELP_DESK_REQUESTER_AGENT_SESSION_CONSENT_TTL_MS
  );
  return Math.min(
    4 * 60 * 60_000,
    Math.max(1_000, Number.isFinite(value) ? value : 60 * 60_000)
  );
}

export async function grantSessionConsent(
  admin: Admin,
  session: AgentSession,
  userId: string
): Promise<{ capabilityIds: string[] }> {
  const capabilityIds = await autorunCoveredCapabilities(
    admin,
    session.organization_id
  );
  const now = new Date();
  const grantedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + consentTtlMs()).toISOString();
  await updateSession(admin, session, {
    autorun_consent_granted_at: grantedAt,
    autorun_consent_revoked_at: null,
    autorun_consent_expires_at: expiresAt,
    autorun_consent_capabilities: capabilityIds,
  });
  Object.assign(session, {
    autorun_consent_granted_at: grantedAt,
    autorun_consent_revoked_at: null,
    autorun_consent_expires_at: expiresAt,
    autorun_consent_capabilities: capabilityIds,
  });
  await writeStep(admin, session, {
    kind: "session_consent_granted",
    resultSummary: `${userId}: ${capabilityIds.join(", ")}`.slice(0, 500),
  });
  return { capabilityIds };
}

export async function revokeSessionConsent(
  admin: Admin,
  session: AgentSession
): Promise<void> {
  const revokedAt = new Date().toISOString();
  await updateSession(admin, session, {
    autorun_consent_revoked_at: revokedAt,
  });
  session.autorun_consent_revoked_at = revokedAt;
  await writeStep(admin, session, {
    kind: "session_consent_revoked",
    resultSummary: "Requester session consent revoked.",
  });
}

export function sessionConsentTitles(capabilityIds: string[]) {
  return capabilityIds.flatMap((id) => {
    const capability = getCapability(id, 1);
    return capability
      ? [
          {
            id,
            title: capability.description,
            whatHappens: capability.expectedResult,
            reversible: true as const,
          },
        ]
      : [];
  });
}
