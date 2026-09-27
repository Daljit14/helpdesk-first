import { describe, expect, test } from "vitest";
import {
  evaluateDemotion,
  evaluatePromotion,
  isSnapshotReversible,
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
});
