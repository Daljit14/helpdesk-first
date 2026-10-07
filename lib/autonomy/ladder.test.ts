import { afterEach, describe, expect, test, vi } from "vitest";
import {
  evaluateDemotion,
  evaluateHonestPromotion,
  evaluatePromotion,
  isSnapshotReversible,
  listLadder,
  recordAutonomyOutcome,
  setTier,
  type LadderStats,
} from "./ladder";
import type { CapabilityDefinition } from "./capabilities/types";
import {
  loadAutonomyMetrics,
  type HonestBreakdown,
} from "@/lib/analytics/autonomy-metrics";

vi.mock("@/lib/analytics/autonomy-metrics", () => ({
  loadAutonomyMetrics: vi.fn(),
}));

const policyMocks = vi.hoisted(() => ({
  isOrgActionPolicyEnabled: vi.fn(() => false),
  loadOrgPolicyCeiling: vi.fn(),
}));

vi.mock("@/lib/admin/flags", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/flags")>(
      "@/lib/admin/flags"
    );
  return {
    ...actual,
    isOrgActionPolicyEnabled: policyMocks.isOrgActionPolicyEnabled,
  };
});
vi.mock("./policy/org-policy-server", () => ({
  loadOrgPolicyCeiling: policyMocks.loadOrgPolicyCeiling,
}));

const stats = (overrides: Partial<LadderStats> = {}): LadderStats => ({
  organization_id: "org",
  capability_id: "device_flush_dns",
  tier: "consent",
  live_runs: 50,
  verified_successes: 48,
  verify_failures: 2,
  rollback_failures: 0,
  security_incidents: 0,
  last_promoted_at: null,
  last_demoted_at: null,
  demote_reason: null,
  ...overrides,
});

const reversible = {
  id: "device_flush_dns",
  version: 1,
  rollback: "handler:device_restore_snapshot",
  sideEffects: "internal_write",
} as unknown as CapabilityDefinition;

afterEach(() => {
  vi.clearAllMocks();
  policyMocks.isOrgActionPolicyEnabled.mockReturnValue(false);
  policyMocks.loadOrgPolicyCeiling.mockResolvedValue(null);
});

describe("autonomy ladder", () => {
  test("records outcomes without promoting a capability", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const outcomes: Record<string, unknown>[] = [];
    const admin = {
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data:
              table === "capability_autonomy_stats"
                ? (rows.get("stats") ?? null)
                : table === "capability_breakers"
                  ? null
                  : null,
            error: null,
          }),
          insert: async (value: Record<string, unknown>) => {
            if (table === "capability_autonomy_outcomes") outcomes.push(value);
            return { data: value, error: null };
          },
          upsert: async (value: Record<string, unknown>) => {
            if (table === "capability_autonomy_stats") rows.set("stats", value);
            return { data: value, error: null };
          },
        };
        return query;
      },
    };
    rows.set("stats", {
      ...stats({ tier: "autorun" }),
      tier: "autorun",
    });
    await recordAutonomyOutcome(admin as never, {
      organizationId: "org",
      capabilityId: "device_flush_dns",
      tierAtTime: "autorun",
      outcome: "verified",
    });
    expect(rows.get("stats")?.tier).toBe("autorun");
    expect(outcomes).toHaveLength(1);

    rows.set("stats", stats({ tier: "consent" }));
    await recordAutonomyOutcome(admin as never, {
      organizationId: "org",
      capabilityId: "device_flush_dns",
      tierAtTime: "consent",
      outcome: "verified",
    });
    expect(rows.get("stats")?.tier).toBe("consent");
  });

  test("requires consent tier, thresholds, and reversibility for promotion", () => {
    expect(
      evaluatePromotion(stats(), reversible, {
        promoteMinRuns: 50,
        promoteMinSuccess: 0.95,
        demoteWindow: 20,
        demoteMinSuccess: 0.9,
      }).eligible
    ).toBe(true);
    expect(
      evaluatePromotion(stats({ tier: "autorun" }), reversible, undefined)
        .eligible
    ).toBe(false);
  });

  test("adds honest-metric reasons at the promotion limits", () => {
    const thresholds = {
      promoteMinRuns: 50,
      promoteMinSuccess: 0.95,
      demoteWindow: 20,
      demoteMinSuccess: 0.9,
    };
    const row: HonestBreakdown = {
      key: "device_flush_dns",
      sessions: 20,
      aiResolved: 18,
      falseResolved: 2,
      staffTouched: 1,
      abandoned: 0,
      escalated: 0,
      aiResolutionRate: 0.9,
      falseResolvedRate: 2 / 20,
    };

    expect(evaluateHonestPromotion(row, thresholds)).toEqual([
      "AI-resolved sessions using this capability were later handled by staff.",
      "False-resolved rate is above the promotion limit.",
    ]);
    expect(
      evaluateHonestPromotion(
        { ...row, staffTouched: 0, falseResolvedRate: 0.05 },
        thresholds
      )
    ).toEqual([]);
  });

  test("refuses autorun promotion when honest metrics show staff handling", async () => {
    vi.mocked(loadAutonomyMetrics).mockResolvedValue({
      v2: {
        byCapability: [
          {
            key: "device_flush_dns",
            sessions: 1,
            aiResolved: 0,
            falseResolved: 0,
            staffTouched: 1,
            abandoned: 0,
            escalated: 0,
            aiResolutionRate: 0,
            falseResolvedRate: 0,
          },
        ],
      },
    } as never);
    const statsRow = stats({
      live_runs: 50,
      verified_successes: 50,
      tier: "consent",
    });
    const admin = {
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: table === "capability_autonomy_stats" ? statsRow : null,
            error: null,
          }),
          upsert: vi.fn(),
          insert: vi.fn(),
        };
        return query;
      },
    };

    const result = await setTier(admin as never, {
      organizationId: "org",
      capabilityId: "device_flush_dns",
      toTier: "autorun",
      reason: "promotion",
      actor: "admin",
      actorUserId: "user-1",
      kind: "promotion",
    });

    expect(result).toEqual({
      ok: false,
      reasons: [
        "AI-resolved sessions using this capability were later handled by staff.",
      ],
    });
    expect(loadAutonomyMetrics).toHaveBeenCalledWith(admin, "org", {
      windowDays: 30,
    });
  });

  test("fails closed when honest metrics cannot be loaded for promotion", async () => {
    vi.mocked(loadAutonomyMetrics).mockRejectedValue(
      new Error("metrics query failed")
    );
    const statsRow = stats({
      live_runs: 50,
      verified_successes: 50,
      tier: "consent",
    });
    const admin = {
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: table === "capability_autonomy_stats" ? statsRow : null,
            error: null,
          }),
          upsert: vi.fn(),
          insert: vi.fn(),
        };
        return query;
      },
    };

    await expect(
      setTier(admin as never, {
        organizationId: "org",
        capabilityId: "device_flush_dns",
        toTier: "autorun",
        reason: "promotion",
        actor: "admin",
        actorUserId: "user-1",
        kind: "promotion",
      })
    ).resolves.toEqual({
      ok: false,
      reasons: ["Honest metrics are unavailable."],
    });
  });

  test("refuses promotion above the organization policy ceiling", async () => {
    policyMocks.isOrgActionPolicyEnabled.mockReturnValue(true);
    policyMocks.loadOrgPolicyCeiling.mockResolvedValue("consent");
    const admin = { from: vi.fn() };

    await expect(
      setTier(admin as never, {
        organizationId: "org",
        capabilityId: "device_flush_dns",
        toTier: "autorun",
        reason: "promotion",
        actor: "admin",
        actorUserId: "user-1",
        kind: "promotion",
      })
    ).resolves.toEqual({
      ok: false,
      reasons: [
        "Your organization's AI action policy allows at most consent for this fix.",
      ],
    });
    expect(policyMocks.loadOrgPolicyCeiling).toHaveBeenCalledWith(admin, {
      organizationId: "org",
      capabilityId: "device_flush_dns",
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  test("demotes on rollback, security incident, breaker, or poor window", () => {
    const thresholds = {
      promoteMinRuns: 10,
      promoteMinSuccess: 0.95,
      demoteWindow: 20,
      demoteMinSuccess: 0.9,
    };
    expect(
      evaluateDemotion(
        [{ tier_at_time: "autorun", outcome: "rollback_failed" }],
        false,
        thresholds
      )
    ).toEqual({ demote: true, reason: "rollback_failure" });
    expect(
      evaluateDemotion(
        [{ tier_at_time: "autorun", outcome: "security_incident" }],
        false,
        thresholds
      )
    ).toEqual({ demote: true, reason: "security_incident" });
    expect(evaluateDemotion([], true, thresholds).demote).toBe(true);
    expect(
      evaluateDemotion(
        [
          { tier_at_time: "autorun", outcome: "verified" },
          { tier_at_time: "autorun", outcome: "verify_failed" },
        ],
        false,
        thresholds
      ).demote
    ).toBe(true);
  });

  test("only snapshot restore handlers qualify as reversible", () => {
    expect(isSnapshotReversible(reversible)).toBe(true);
    expect(
      isSnapshotReversible({
        ...reversible,
        rollback: "compensating",
      })
    ).toBe(false);
  });

  test("returns JSON-serializable ladder rows", async () => {
    const admin = {
      from(table: string) {
        const data =
          table === "organization_capabilities"
            ? [
                {
                  capability_id: "device_flush_dns",
                  min_version: 1,
                  enabled: true,
                },
              ]
            : [];
        const query = {
          select: () => query,
          eq: () => query,
          then: (
            resolve: (value: { data: unknown[]; error: null }) => unknown,
            reject?: (reason: unknown) => unknown
          ) => Promise.resolve({ data, error: null }).then(resolve, reject),
        };
        return query;
      },
    };

    const rows = await listLadder(admin as never, "org");

    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
    expect(rows[0]?.capability).toEqual({
      id: "device_flush_dns",
      description: expect.any(String),
      sideEffects: "external_write",
      rollback: "handler:device_restore_snapshot",
    });
  });
});
