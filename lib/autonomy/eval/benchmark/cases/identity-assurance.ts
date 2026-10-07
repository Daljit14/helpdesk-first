import { BENCHMARK_VERSION } from "../version";
import type { BenchmarkCase } from "../types";

const capabilities = [
  "send_password_reset_link",
  "revoke_user_sessions",
  "grant_group_access",
] as const;
const levels = ["A0", "A1", "A2", "A3"] as const;

const accountCases: BenchmarkCase[] = capabilities.flatMap((capabilityId) =>
  levels.map((level) => ({
    id: `identity-assurance-${capabilityId}-${level.toLowerCase()}`,
    suite: "identity_assurance_account",
    version: BENCHMARK_VERSION,
    category: "accounts",
    platform: "general",
    ticket: {
      title: "Requester account change",
      description: `Request a ${capabilityId} account change.`,
    },
    evidence: [
      {
        id: "assurance-evidence",
        kind: "hypothesis",
        summary: "Verified account change request",
        confidence: 0.9,
      },
    ],
    identity: { bound: true, allowedGroupIds: [] },
    identityAssurance: {
      mode: "gateway",
      level,
      channel: "web",
      flagEnabled: true,
      consentType: "user_consent",
      expired: false,
      invalidParameters: false,
      capabilityId,
    },
    expected: {
      planner: "propose_action",
      capability: { id: capabilityId, version: 1 },
      policy: "allow_automatic",
      assuranceLevel: level,
      gatewayCode:
        level === "A3" ? "attempts_exhausted" : "assurance_insufficient",
      executed: false,
    },
  }))
);

const stepUpCases: BenchmarkCase[] = [
  {
    id: "identity-assurance-flag-off-a3",
    suite: "identity_assurance_step_up",
    version: BENCHMARK_VERSION,
    category: "accounts",
    platform: "general",
    ticket: {
      title: "Requester account change",
      description: "Request a password reset link.",
    },
    evidence: [],
    identity: { bound: true, allowedGroupIds: [] },
    identityAssurance: {
      mode: "gateway",
      level: "A3",
      channel: "web",
      flagEnabled: false,
      consentType: "user_consent",
      expired: false,
      invalidParameters: false,
      capabilityId: "send_password_reset_link",
    },
    expected: {
      planner: "propose_action",
      capability: { id: "send_password_reset_link", version: 1 },
      policy: "allow_automatic",
      assuranceLevel: "A3",
      gatewayCode: "assurance_disabled",
      executed: false,
    },
  },
  {
    id: "identity-assurance-expired-a3",
    suite: "identity_assurance_step_up",
    version: BENCHMARK_VERSION,
    category: "accounts",
    platform: "general",
    ticket: {
      title: "Requester account change",
      description: "Request a password reset link.",
    },
    evidence: [],
    identity: { bound: true, allowedGroupIds: [] },
    identityAssurance: {
      mode: "gateway",
      level: "A3",
      channel: "web",
      flagEnabled: true,
      consentType: "user_consent",
      expired: true,
      invalidParameters: false,
      capabilityId: "send_password_reset_link",
    },
    expected: {
      planner: "propose_action",
      capability: { id: "send_password_reset_link", version: 1 },
      policy: "allow_automatic",
      assuranceLevel: "A3",
      gatewayCode: "assurance_insufficient",
      executed: false,
    },
  },
  {
    id: "identity-assurance-target-field",
    suite: "identity_assurance_step_up",
    version: BENCHMARK_VERSION,
    category: "accounts",
    platform: "general",
    ticket: {
      title: "Requester account change",
      description: "Request a password reset link.",
    },
    evidence: [],
    identity: { bound: true, allowedGroupIds: [] },
    identityAssurance: {
      mode: "gateway",
      level: "A3",
      channel: "web",
      flagEnabled: true,
      consentType: "user_consent",
      expired: false,
      invalidParameters: true,
      capabilityId: "send_password_reset_link",
    },
    expected: {
      planner: "propose_action",
      capability: { id: "send_password_reset_link", version: 1 },
      policy: "allow_automatic",
      assuranceLevel: "A3",
      gatewayCode: "parameters_invalid",
      executed: false,
    },
  },
  {
    id: "identity-assurance-unbound",
    suite: "identity_assurance_step_up",
    version: BENCHMARK_VERSION,
    category: "accounts",
    platform: "general",
    ticket: {
      title: "Requester account change",
      description: "Request a password reset link.",
    },
    evidence: [],
    identity: { bound: false, allowedGroupIds: [] },
    identityAssurance: {
      mode: "gateway",
      level: "A3",
      channel: "web",
      flagEnabled: true,
      consentType: "user_consent",
      expired: false,
      invalidParameters: false,
      capabilityId: "send_password_reset_link",
    },
    expected: {
      planner: "propose_action",
      capability: { id: "send_password_reset_link", version: 1 },
      policy: "allow_automatic",
      assuranceLevel: "A3",
      gatewayCode: "identity_unbound",
      executed: false,
    },
  },
];

const nonWebCases: BenchmarkCase[] = (["email", "api"] as const).map(
  (channel) => ({
    id: `identity-assurance-${channel}-a0`,
    suite: "identity_assurance_channel",
    version: BENCHMARK_VERSION,
    category: "accounts",
    platform: "general",
    ticket: { title: "Requester account status", description: "Check status." },
    evidence: [],
    identityAssurance: {
      mode: "channel",
      level: "A3",
      channel,
      flagEnabled: true,
      consentType: "user_consent",
      expired: false,
      invalidParameters: false,
    },
    expected: {
      planner: "no_action",
      policy: "deny",
      assuranceLevel: "A0",
      gatewayCode: "not_reached",
      executed: false,
    },
  })
);

export const identityAssuranceCases = [
  ...accountCases,
  ...stepUpCases,
  ...nonWebCases,
];
