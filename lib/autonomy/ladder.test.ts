import { describe, expect, test } from "vitest";
import {
  evaluateDemotion,
  evaluatePromotion,
  isSnapshotReversible,
  listLadder,
  recordAutonomyOutcome,
  type LadderStats,
} from "./ladder";
import type { CapabilityDefinition } from "./capabilities/types";

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
