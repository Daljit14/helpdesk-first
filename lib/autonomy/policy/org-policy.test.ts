import { describe, expect, test } from "vitest";
import {
  describeOrgPolicy,
  evaluateOrgPolicy,
  orgActionPolicyInputSchema,
  orgActionPolicyRuleSchema,
  orgPolicyCeiling,
  type OrgActionPolicyRule,
} from "./org-policy";

const rule = (
  overrides: Partial<OrgActionPolicyRule> = {}
): OrgActionPolicyRule => ({
  id: "00000000-0000-4000-8000-000000000003",
  capabilityId: "account_unlock",
  effect: "allow",
  scopeGroups: [],
  maxTier: "autorun",
  autorunWindows: [],
  requireStaffApproval: false,
  ...overrides,
});

describe("organization action policy", () => {
  test("parses valid policy rules and rejects invalid time zones and windows", () => {
    expect(orgActionPolicyRuleSchema.safeParse(rule()).success).toBe(true);
    expect(
      orgActionPolicyRuleSchema.safeParse(
        rule({
          autorunWindows: [
            {
              days: [1],
              start: "09:00",
              end: "10:00",
              timeZone: "Not/A_Time_Zone",
            },
          ],
        })
      ).success
    ).toBe(false);
    expect(
      orgActionPolicyRuleSchema.safeParse(
        rule({
          autorunWindows: [
            { days: [7], start: "25:00", end: "09:00", timeZone: "UTC" },
          ],
        })
      ).success
    ).toBe(false);
    expect(
      orgActionPolicyInputSchema.safeParse({
        ...rule(),
        id: "not-a-uuid",
        note: "",
      }).success
    ).toBe(false);
  });

  test("allows an ungoverned capability at the ladder tier", () => {
    expect(
      evaluateOrgPolicy({
        rules: [],
        capabilityId: "account_unlock",
        requesterGroups: [],
        tier: "consent",
        now: new Date("2026-10-07T12:00:00Z"),
      })
    ).toMatchObject({
      allowed: true,
      governed: false,
      effectiveMaxTier: "consent",
      reasons: [],
    });
  });

  test("marks nonmatching deny-only rules governed but does not restrict", () => {
    expect(
      evaluateOrgPolicy({
        rules: [rule({ effect: "deny", scopeGroups: ["group-a"] })],
        capabilityId: "account_unlock",
        requesterGroups: ["group-b"],
        tier: "autorun",
        now: new Date("2026-10-07T12:00:00Z"),
      })
    ).toMatchObject({
      allowed: true,
      governed: true,
      effectiveMaxTier: "autorun",
    });
  });

  test("fails closed for matching deny rules, including unavailable groups", () => {
    for (const requesterGroups of [["group-a"], null]) {
      expect(
        evaluateOrgPolicy({
          rules: [rule({ effect: "deny", scopeGroups: ["group-a"] })],
          capabilityId: "account_unlock",
          requesterGroups,
          tier: "autorun",
          now: new Date("2026-10-07T12:00:00Z"),
        })
      ).toMatchObject({
        allowed: false,
        effectiveMaxTier: "disabled",
        reasons: ["org_policy_denied"],
      });
    }
  });

  test("denies when relevant allow rules do not match the requester", () => {
    expect(
      evaluateOrgPolicy({
        rules: [rule({ scopeGroups: ["group-a"] })],
        capabilityId: "account_unlock",
        requesterGroups: ["group-b"],
        tier: "autorun",
        now: new Date("2026-10-07T12:00:00Z"),
      })
    ).toMatchObject({
      allowed: false,
      reasons: ["org_policy_not_in_scope"],
    });
  });

  test("adds the unavailable-groups reason for scoped allows", () => {
    expect(
      evaluateOrgPolicy({
        rules: [rule({ scopeGroups: ["group-a"] })],
        capabilityId: "account_unlock",
        requesterGroups: null,
        tier: "autorun",
        now: new Date("2026-10-07T12:00:00Z"),
      }).reasons
    ).toEqual(["org_policy_not_in_scope", "org_policy_groups_unavailable"]);
  });

  test("matching deny takes precedence over matching allow", () => {
    expect(
      evaluateOrgPolicy({
        rules: [
          rule({ effect: "allow", scopeGroups: [] }),
          rule({ effect: "deny", scopeGroups: ["group-a"] }),
        ],
        capabilityId: "account_unlock",
        requesterGroups: ["group-a"],
        tier: "autorun",
        now: new Date("2026-10-07T12:00:00Z"),
      })
    ).toMatchObject({
      allowed: false,
      reasons: ["org_policy_denied"],
    });
  });

  test("prefers capability-specific allows over wildcard rules", () => {
    expect(
      evaluateOrgPolicy({
        rules: [
          rule({ capabilityId: "*", maxTier: "consent" }),
          rule({ capabilityId: "account_unlock", maxTier: "autorun" }),
        ],
        capabilityId: "account_unlock",
        requesterGroups: [],
        tier: "autorun",
        now: new Date("2026-10-07T12:00:00Z"),
      }).effectiveMaxTier
    ).toBe("autorun");
  });

  test("takes the most restrictive ladder and rule tiers", () => {
    const belowLadder = evaluateOrgPolicy({
      rules: [rule({ maxTier: "autorun" }), rule({ maxTier: "consent" })],
      capabilityId: "account_unlock",
      requesterGroups: [],
      tier: "shadow",
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(belowLadder.effectiveMaxTier).toBe("shadow");
    expect(belowLadder.reasons).toEqual([]);
    const belowPolicy = evaluateOrgPolicy({
      rules: [rule({ maxTier: "consent" }), rule({ maxTier: "shadow" })],
      capabilityId: "account_unlock",
      requesterGroups: [],
      tier: "autorun",
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(belowPolicy.effectiveMaxTier).toBe("consent");
    expect(belowPolicy.reasons).toEqual(["org_policy_max_tier"]);
  });

  test("applies weekday windows in the configured local time zone", () => {
    const monday = new Date("2026-10-05T13:30:00Z");
    const result = evaluateOrgPolicy({
      rules: [
        rule({
          autorunWindows: [
            {
              days: [1],
              start: "09:00",
              end: "10:00",
              timeZone: "America/New_York",
            },
          ],
        }),
      ],
      capabilityId: "account_unlock",
      requesterGroups: [],
      tier: "autorun",
      now: monday,
    });
    expect(result.effectiveMaxTier).toBe("autorun");
  });

  test("handles overnight windows and never matches equal endpoints", () => {
    const overnight = {
      days: [1],
      start: "22:00",
      end: "02:00",
      timeZone: "America/New_York",
    };
    const atTuesdayOne = new Date("2026-10-06T05:00:00Z");
    expect(
      evaluateOrgPolicy({
        rules: [rule({ autorunWindows: [overnight] })],
        capabilityId: "account_unlock",
        requesterGroups: [],
        tier: "autorun",
        now: atTuesdayOne,
      }).effectiveMaxTier
    ).toBe("autorun");
    expect(
      evaluateOrgPolicy({
        rules: [
          rule({
            autorunWindows: [
              {
                days: [2],
                start: "09:00",
                end: "09:00",
                timeZone: "UTC",
              },
            ],
          }),
        ],
        capabilityId: "account_unlock",
        requesterGroups: [],
        tier: "autorun",
        now: new Date("2026-10-06T09:00:00Z"),
      })
    ).toMatchObject({
      effectiveMaxTier: "consent",
      reasons: ["org_policy_max_tier", "org_policy_outside_autorun_window"],
    });
  });

  test("uses consent outside windows and requires staff approval when configured", () => {
    const result = evaluateOrgPolicy({
      rules: [
        rule({
          autorunWindows: [
            {
              days: [1],
              start: "09:00",
              end: "10:00",
              timeZone: "America/New_York",
            },
          ],
          requireStaffApproval: true,
        }),
      ],
      capabilityId: "account_unlock",
      requesterGroups: [],
      tier: "autorun",
      now: new Date("2026-10-05T16:00:00Z"),
    });
    expect(result).toMatchObject({
      effectiveMaxTier: "consent",
      requireStaffApproval: true,
      reasons: [
        "org_policy_max_tier",
        "org_policy_outside_autorun_window",
        "org_policy_staff_approval",
      ],
    });
  });

  test("fails autorun closed for invalid time data", () => {
    const result = evaluateOrgPolicy({
      rules: [
        rule({
          autorunWindows: [
            {
              days: [1],
              start: "9am",
              end: "10am",
              timeZone: "Invalid/Zone",
            },
          ],
        }),
      ],
      capabilityId: "account_unlock",
      requesterGroups: [],
      tier: "autorun",
      now: new Date("2026-10-05T14:30:00Z"),
    });
    expect(result.effectiveMaxTier).toBe("consent");
    expect(result.reasons).toContain("org_policy_outside_autorun_window");
  });

  test("computes org-wide ceiling without windows", () => {
    expect(
      orgPolicyCeiling(
        [
          rule({ capabilityId: "*", maxTier: "autorun" }),
          rule({
            capabilityId: "account_unlock",
            maxTier: "consent",
            autorunWindows: [
              {
                days: [1],
                start: "09:00",
                end: "10:00",
                timeZone: "UTC",
              },
            ],
          }),
        ],
        "account_unlock"
      )
    ).toBe("consent");
    expect(
      orgPolicyCeiling(
        [rule({ effect: "deny", scopeGroups: [] })],
        "account_unlock"
      )
    ).toBe("disabled");
    expect(orgPolicyCeiling([], "account_unlock")).toBe("autorun");
  });

  test("describes rules without exposing implementation-only wording", () => {
    expect(describeOrgPolicy([rule()], (id) => `${id} label`)).toEqual([
      "The AI can account_unlock label for everyone, on its own.",
    ]);
  });
});
