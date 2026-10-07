import { alertSecurityEvent } from "./alerts";
import { readBreakerState } from "./breaker";
import { isDenylisted } from "@/lib/agent/denylist";
import { listCapabilities, getCapability } from "./capabilities/registry";
import type { CapabilityDefinition } from "./capabilities/types";
import type { createAdminClient } from "@/lib/supabase/admin";
import { isOrgActionPolicyEnabled } from "@/lib/admin/flags";
import { loadOrgPolicyCeiling } from "./policy/org-policy-server";
import {
  loadAutonomyMetrics,
  type HonestBreakdown,
} from "@/lib/analytics/autonomy-metrics";

export type AutonomyTier = "disabled" | "shadow" | "consent" | "autorun";
export type Outcome =
  "verified" | "verify_failed" | "rollback_failed" | "security_incident";
export type LadderThresholds = {
  promoteMinRuns: number;
  promoteMinSuccess: number;
  demoteWindow: number;
  demoteMinSuccess: number;
};
export type LadderStats = {
  organization_id: string;
  capability_id: string;
  tier: AutonomyTier;
  live_runs: number;
  verified_successes: number;
  verify_failures: number;
  rollback_failures: number;
  security_incidents: number;
  last_promoted_at: string | null;
  last_demoted_at: string | null;
  demote_reason: string | null;
};
export type LadderCapability = Pick<
  CapabilityDefinition,
  "id" | "description" | "sideEffects" | "rollback"
>;
export type AutonomyOutcome = {
  tier_at_time: AutonomyTier;
  outcome: Outcome;
  created_at?: string;
};
export type LadderRow = LadderStats & {
  capability: LadderCapability;
  reversible: boolean;
  promotion: { eligible: boolean; reasons: string[] };
  transitions: Array<{
    capability_id?: string;
    from_tier: AutonomyTier;
    to_tier: AutonomyTier;
    kind: "promotion" | "demotion" | "admin_set";
    reason: string;
    actor: string;
    created_at: string;
  }>;
};

type Admin = ReturnType<typeof createAdminClient>;
type OutcomeInput = {
  organizationId: string;
  capabilityId: string;
  runId?: string;
  executionId?: string;
  agentSessionId?: string;
  tierAtTime: AutonomyTier;
  outcome: Outcome;
};

const tiers: AutonomyTier[] = ["disabled", "shadow", "consent", "autorun"];

function asTier(value: unknown): AutonomyTier {
  return tiers.includes(value as AutonomyTier)
    ? (value as AutonomyTier)
    : "shadow";
}

export function getLadderThresholds(): LadderThresholds {
  const number = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    promoteMinRuns: Math.max(
      10,
      Math.floor(number("HELP_DESK_AUTONOMY_PROMOTE_MIN_RUNS", 50))
    ),
    promoteMinSuccess: Math.min(
      1,
      Math.max(0.8, number("HELP_DESK_AUTONOMY_PROMOTE_MIN_SUCCESS", 0.95))
    ),
    demoteWindow: Math.max(
      1,
      Math.floor(number("HELP_DESK_AUTONOMY_DEMOTE_WINDOW", 20))
    ),
    demoteMinSuccess: Math.min(
      1,
      Math.max(0.8, number("HELP_DESK_AUTONOMY_DEMOTE_MIN_SUCCESS", 0.9))
    ),
  };
}

export async function readTier(
  admin: Admin,
  organizationId: string,
  capabilityId: string
): Promise<AutonomyTier> {
  const stats = await admin
    .from("capability_autonomy_stats")
    .select("tier")
    .eq("organization_id", organizationId)
    .eq("capability_id", capabilityId)
    .maybeSingle();
  if (!stats.error && stats.data) return asTier(stats.data.tier);
  const enabled = await admin
    .from("organization_capabilities")
    .select("enabled")
    .eq("organization_id", organizationId)
    .eq("capability_id", capabilityId)
    .eq("enabled", true)
    .maybeSingle();
  return !enabled.error && enabled.data ? "consent" : "shadow";
}

export function isSnapshotReversible(
  capability: CapabilityDefinition
): boolean {
  return (
    capability.rollback === "handler:device_restore_snapshot" &&
    !isDenylisted(capability.id, capability)
  );
}

export function evaluatePromotion(
  stats: LadderStats,
  capability: CapabilityDefinition,
  thresholds: LadderThresholds = getLadderThresholds()
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (stats.live_runs < thresholds.promoteMinRuns)
    reasons.push(`Requires at least ${thresholds.promoteMinRuns} live runs.`);
  const success =
    stats.live_runs > 0 ? stats.verified_successes / stats.live_runs : 0;
  if (success < thresholds.promoteMinSuccess)
    reasons.push(
      `Verified success must be at least ${Math.round(thresholds.promoteMinSuccess * 100)}%.`
    );
  if (stats.rollback_failures > 0)
    reasons.push("Rollback failures must be zero.");
  if (stats.security_incidents > 0)
    reasons.push("Security incidents must be zero.");
  if (!isSnapshotReversible(capability))
    reasons.push("Capability must be snapshot-reversible and not denylisted.");
  if (stats.tier !== "consent")
    reasons.push("Capability must currently be at consent tier.");
  return { eligible: reasons.length === 0, reasons };
}

export function evaluateHonestPromotion(
  row: HonestBreakdown | undefined,
  thresholds: LadderThresholds = getLadderThresholds()
): string[] {
  if (!row) return [];
  const reasons: string[] = [];
  if (row.staffTouched > 0)
    reasons.push(
      "AI-resolved sessions using this capability were later handled by staff."
    );
  if (row.falseResolvedRate > 1 - thresholds.promoteMinSuccess)
    reasons.push("False-resolved rate is above the promotion limit.");
  return reasons;
}

export function evaluateDemotion(
  recent: AutonomyOutcome[],
  breakerOpen: boolean,
  thresholds: LadderThresholds = getLadderThresholds()
): { demote: boolean; reason?: string } {
  const outcomes = recent.slice(0, thresholds.demoteWindow);
  if (outcomes.some((item) => item.outcome === "rollback_failed"))
    return { demote: true, reason: "rollback_failure" };
  if (outcomes.some((item) => item.outcome === "security_incident"))
    return { demote: true, reason: "security_incident" };
  if (breakerOpen) return { demote: true, reason: "breaker_open" };
  const counted = outcomes.filter((item) =>
    ["verified", "verify_failed"].includes(item.outcome)
  );
  if (
    counted.length > 0 &&
    counted.filter((item) => item.outcome === "verified").length /
      counted.length <
      thresholds.demoteMinSuccess
  )
    return { demote: true, reason: "verified_success_below_threshold" };
  return { demote: false };
}

function defaultStats(
  organizationId: string,
  capabilityId: string,
  tier: AutonomyTier
): LadderStats {
  return {
    organization_id: organizationId,
    capability_id: capabilityId,
    tier,
    live_runs: 0,
    verified_successes: 0,
    verify_failures: 0,
    rollback_failures: 0,
    security_incidents: 0,
    last_promoted_at: null,
    last_demoted_at: null,
    demote_reason: null,
  };
}

export async function recordAutonomyOutcome(
  admin: Admin,
  input: OutcomeInput
): Promise<{ demoted: boolean; reason?: string }> {
  await admin.from("capability_autonomy_outcomes").insert({
    organization_id: input.organizationId,
    capability_id: input.capabilityId,
    run_id: input.runId ?? null,
    execution_id: input.executionId ?? null,
    agent_session_id: input.agentSessionId ?? null,
    tier_at_time: input.tierAtTime,
    outcome: input.outcome,
  });
  const currentTier = await readTier(
    admin,
    input.organizationId,
    input.capabilityId
  );
  const current = await admin
    .from("capability_autonomy_stats")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("capability_id", input.capabilityId)
    .maybeSingle();
  const stats =
    (current.data as LadderStats | null) ??
    defaultStats(input.organizationId, input.capabilityId, currentTier);
  const values = {
    ...stats,
    tier: currentTier,
    live_runs: stats.live_runs + (input.tierAtTime === "consent" ? 1 : 0),
    verified_successes:
      stats.verified_successes + (input.outcome === "verified" ? 1 : 0),
    verify_failures:
      stats.verify_failures + (input.outcome === "verify_failed" ? 1 : 0),
    rollback_failures:
      stats.rollback_failures + (input.outcome === "rollback_failed" ? 1 : 0),
    security_incidents:
      stats.security_incidents +
      (input.outcome === "security_incident" ? 1 : 0),
    updated_at: new Date().toISOString(),
  };
  await admin.from("capability_autonomy_stats").upsert(values, {
    onConflict: "organization_id,capability_id",
  });
  if (currentTier !== "autorun") return { demoted: false };
  const recent = await admin
    .from("capability_autonomy_outcomes")
    .select("tier_at_time,outcome,created_at")
    .eq("organization_id", input.organizationId)
    .eq("capability_id", input.capabilityId)
    .order("created_at", { ascending: false })
    .limit(getLadderThresholds().demoteWindow);
  const breaker = await readBreakerState(
    admin,
    input.organizationId,
    input.capabilityId,
    new Date()
  );
  const demotion = evaluateDemotion(
    (recent.data ?? []) as AutonomyOutcome[],
    breaker.open,
    getLadderThresholds()
  );
  if (!demotion.demote || !demotion.reason) return { demoted: false };
  const now = new Date().toISOString();
  await admin.from("capability_autonomy_stats").upsert(
    {
      ...values,
      tier: "consent",
      last_demoted_at: now,
      demote_reason: demotion.reason,
    },
    { onConflict: "organization_id,capability_id" }
  );
  await admin.from("capability_autonomy_transitions").insert({
    organization_id: input.organizationId,
    capability_id: input.capabilityId,
    from_tier: "autorun",
    to_tier: "consent",
    kind: "demotion",
    reason: demotion.reason,
    actor: "system",
  });
  if (input.runId) {
    await admin.from("resolution_events").insert({
      organization_id: input.organizationId,
      run_id: input.runId,
      ticket_id: "",
      kind: "autonomy.demoted",
      actor: "orchestrator",
      detail: { capabilityId: input.capabilityId, reason: demotion.reason },
      initiated_by: "ai",
    });
  }
  await alertSecurityEvent(admin, {
    organizationId: input.organizationId,
    ticketId: "",
    runId: input.runId ?? null,
    kind: "security.autonomy_demoted",
    detail: { capabilityId: input.capabilityId, reason: demotion.reason },
  });
  return { demoted: true, reason: demotion.reason };
}

export async function setTier(
  admin: Admin,
  input: {
    organizationId: string;
    capabilityId: string;
    toTier: AutonomyTier;
    reason: string;
    actor: string;
    actorUserId: string;
    kind: "promotion" | "admin_set";
  }
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const capability = getCapability(input.capabilityId, 1);
  if (!capability) return { ok: false, reasons: ["Unknown capability."] };
  if (isOrgActionPolicyEnabled()) {
    const ceiling = await loadOrgPolicyCeiling(admin, {
      organizationId: input.organizationId,
      capabilityId: input.capabilityId,
    });
    if (ceiling) {
      const tierOrder: Record<AutonomyTier, number> = {
        disabled: 0,
        shadow: 1,
        consent: 2,
        autorun: 3,
      };
      if (tierOrder[input.toTier] > tierOrder[ceiling])
        return {
          ok: false,
          reasons: [
            `Your organization's AI action policy allows at most ${ceiling} for this fix.`,
          ],
        };
    }
  }
  const currentTier = await readTier(
    admin,
    input.organizationId,
    input.capabilityId
  );
  if (input.toTier === "autorun") {
    if (input.kind !== "promotion")
      return { ok: false, reasons: ["Autorun requires an admin promotion."] };
    const row = await admin
      .from("capability_autonomy_stats")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("capability_id", input.capabilityId)
      .maybeSingle();
    const stats =
      (row.data as LadderStats | null) ??
      defaultStats(input.organizationId, input.capabilityId, currentTier);
    const eligibility = evaluatePromotion(stats, capability);
    let honestReasons: string[];
    try {
      const metrics = await loadAutonomyMetrics(admin, input.organizationId, {
        windowDays: 30,
      });
      honestReasons = evaluateHonestPromotion(
        metrics.v2.byCapability.find((item) => item.key === input.capabilityId)
      );
    } catch {
      return { ok: false, reasons: ["Honest metrics are unavailable."] };
    }
    const reasons = [...eligibility.reasons, ...honestReasons];
    if (reasons.length > 0) return { ok: false, reasons };
  }
  const now = new Date().toISOString();
  const existing = await admin
    .from("capability_autonomy_stats")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("capability_id", input.capabilityId)
    .maybeSingle();
  await admin.from("capability_autonomy_stats").upsert(
    {
      ...defaultStats(input.organizationId, input.capabilityId, input.toTier),
      ...(existing.data ?? {}),
      tier: input.toTier,
      last_promoted_at:
        input.kind === "promotion"
          ? now
          : (existing.data?.last_promoted_at ?? null),
      updated_at: now,
    },
    { onConflict: "organization_id,capability_id" }
  );
  await admin.from("capability_autonomy_transitions").insert({
    organization_id: input.organizationId,
    capability_id: input.capabilityId,
    from_tier: currentTier,
    to_tier: input.toTier,
    kind: input.kind,
    reason: input.reason,
    actor: input.actor,
    actor_user_id: input.actorUserId,
  });
  return { ok: true };
}

export async function listLadder(
  admin: Admin,
  organizationId: string
): Promise<LadderRow[]> {
  const [orgCaps, statsResult, transitionsResult] = await Promise.all([
    admin
      .from("organization_capabilities")
      .select("capability_id,min_version,enabled")
      .eq("organization_id", organizationId)
      .eq("enabled", true),
    admin
      .from("capability_autonomy_stats")
      .select("*")
      .eq("organization_id", organizationId),
    admin
      .from("capability_autonomy_transitions")
      .select("capability_id,from_tier,to_tier,kind,reason,actor,created_at")
      .eq("organization_id", organizationId),
  ]);
  const stats = new Map(
    ((statsResult.data ?? []) as LadderStats[]).map((row) => [
      row.capability_id,
      row,
    ])
  );
  return (
    (orgCaps.data ?? []) as Array<{
      capability_id: string;
      min_version: number;
    }>
  ).flatMap((row) => {
    const capability =
      getCapability(row.capability_id, row.min_version) ??
      listCapabilities().find((item) => item.id === row.capability_id);
    if (!capability || capability.sideEffects === "read_only") return [];
    const tier = stats.get(row.capability_id)?.tier ?? "consent";
    const current =
      stats.get(row.capability_id) ??
      defaultStats(organizationId, row.capability_id, tier);
    const reversible = isSnapshotReversible(capability);
    const capabilitySummary: LadderCapability = {
      id: capability.id,
      description: capability.description,
      sideEffects: capability.sideEffects,
      rollback: capability.rollback,
    };
    return [
      {
        ...current,
        tier: asTier(current.tier),
        capability: capabilitySummary,
        reversible,
        promotion: evaluatePromotion(current, capability),
        transitions: (
          (transitionsResult.data ?? []) as LadderRow["transitions"]
        )
          .filter((item) => item.capability_id === row.capability_id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 5),
      },
    ];
  });
}
