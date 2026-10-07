import { BENCHMARK_VERSION } from "../version";
import type { BenchmarkCase } from "../types";

const capabilityId = "send_password_reset_link";
const weekdays = [0, 1, 2, 3, 4, 5, 6];
const groupId = "00000000-0000-4000-8000-000000000099";
const gatewayCodes: Record<string, string> = {
  "org-policy-allow-and-deny-same-capability": "org_policy_denied",
  "org-policy-deny-matching-group": "org_policy_denied",
  "org-policy-deny-unreadable-groups": "org_policy_denied",
  "org-policy-allow-unreadable-groups": "org_policy_denied",
  "org-policy-wildcard-deny": "org_policy_denied",
  "org-policy-autorun-outside-window": "org_policy_tier_exceeded",
  "org-policy-window-crosses-midnight": "allowed",
  "org-policy-ceiling-refuses-promotion": "org_policy_tier_exceeded",
  "org-policy-staff-approval-user": "org_policy_staff_approval_required",
  "org-policy-staff-approval-technician": "attempts_exhausted",
  "org-policy-no-rules": "attempts_exhausted",
  "org-policy-flag-off": "attempts_exhausted",
};
type OrgPolicyScenario = NonNullable<
  NonNullable<BenchmarkCase["identityAssurance"]>["orgPolicy"]
>;
type OrgPolicyScenarioInput = Partial<OrgPolicyScenario>;
type OrgPolicyRule = OrgPolicyScenario["rules"][number];

function rule(overrides: Partial<OrgPolicyRule> = {}) {
  return {
    capabilityId,
    effect: "allow" as const,
    scopeGroups: [],
    maxTier: "autorun" as const,
    autorunWindows: [],
    requireStaffApproval: false,
    ...overrides,
  };
}

function orgPolicyCase(
  id: string,
  orgPolicy: OrgPolicyScenarioInput,
  overrides: Partial<NonNullable<BenchmarkCase["identityAssurance"]>> = {}
): BenchmarkCase {
  return {
    id,
    suite: "org_policy",
    version: BENCHMARK_VERSION,
    category: "organization_policy",
    platform: "general",
    ticket: {
      title: "Requester account recovery",
      description: "Request a self-service account recovery link.",
    },
    evidence: [
      {
        id: "policy-evidence",
        kind: "hypothesis",
        summary: "Verified account recovery request",
        confidence: 0.9,
      },
    ],
    identity: { bound: true, allowedGroupIds: [] },
    identityAssurance: {
      mode: "gateway",
      level: "A3",
      capabilityId,
      ...overrides,
      channel: overrides.channel ?? "web",
      flagEnabled: overrides.flagEnabled ?? true,
      expired: overrides.expired ?? false,
      invalidParameters: overrides.invalidParameters ?? false,
      consentType: overrides.consentType ?? "user_consent",
      orgPolicy: {
        enabled: true,
        autoMode: false,
        promotionAttempt: false,
        rules: [],
        ...orgPolicy,
      },
    },
    expected: {
      planner: "propose_action",
      capability: { id: capabilityId, version: 1 },
      policy: "allow_automatic",
      gatewayCode: gatewayCodes[id],
      assuranceLevel: "A3",
      executed: id === "org-policy-window-crosses-midnight",
    },
  };
}

export const orgPolicyCases: BenchmarkCase[] = [
  orgPolicyCase("org-policy-allow-and-deny-same-capability", {
    rules: [rule(), rule({ effect: "deny" })],
  }),
  orgPolicyCase("org-policy-deny-matching-group", {
    groups: [groupId],
    rules: [
      rule({
        effect: "deny",
        scopeGroups: [groupId],
        maxTier: "consent",
      }),
    ],
  }),
  orgPolicyCase("org-policy-deny-unreadable-groups", {
    rules: [
      rule({
        effect: "deny",
        scopeGroups: [groupId],
        maxTier: "consent",
      }),
    ],
  }),
  orgPolicyCase("org-policy-allow-unreadable-groups", {
    rules: [
      rule({
        scopeGroups: [groupId],
        maxTier: "autorun",
      }),
    ],
  }),
  orgPolicyCase("org-policy-wildcard-deny", {
    rules: [
      rule({ capabilityId: "*", effect: "deny", maxTier: "consent" }),
      rule(),
    ],
  }),
  orgPolicyCase("org-policy-autorun-outside-window", {
    autoMode: true,
    ladderTier: "autorun",
    rules: [
      rule({
        autorunWindows: [
          {
            days: weekdays,
            start: "00:00",
            end: "00:00",
            timeZone: "UTC",
          },
        ],
      }),
    ],
  }),
  orgPolicyCase("org-policy-window-crosses-midnight", {
    autoMode: true,
    ladderTier: "autorun",
    rules: [
      rule({
        autorunWindows: [
          {
            days: weekdays,
            start: "01:00",
            end: "23:00",
            timeZone: "UTC",
          },
          {
            days: weekdays,
            start: "23:00",
            end: "01:00",
            timeZone: "UTC",
          },
        ],
      }),
    ],
  }),
  orgPolicyCase("org-policy-ceiling-refuses-promotion", {
    autoMode: true,
    ladderTier: "consent",
    promotionAttempt: true,
    rules: [rule({ maxTier: "consent" })],
  }),
  orgPolicyCase(
    "org-policy-staff-approval-user",
    {
      rules: [rule({ requireStaffApproval: true })],
    },
    { consentType: "user_consent" }
  ),
  orgPolicyCase(
    "org-policy-staff-approval-technician",
    {
      rules: [rule({ requireStaffApproval: true })],
    },
    { consentType: "technician_approval" }
  ),
  orgPolicyCase("org-policy-no-rules", {
    rules: [],
  }),
  orgPolicyCase("org-policy-flag-off", {
    enabled: false,
    rules: [rule({ effect: "deny" })],
  }),
];
