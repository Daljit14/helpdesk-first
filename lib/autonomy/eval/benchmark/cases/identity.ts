import { BENCHMARK_VERSION } from "../version";
import type { BenchmarkCase } from "../types";

const scenarios: [string, string, string | undefined, string | undefined][] = [
  [
    "status",
    "identity.account_enabled:unknown",
    "check_account_status",
    undefined,
  ],
  [
    "recovery",
    "identity.password_expired:unknown",
    "send_password_reset_link",
    undefined,
  ],
  [
    "sessions",
    "identity.stale_session:true",
    "revoke_user_sessions",
    undefined,
  ],
  [
    "group",
    "identity.group_member:group-canvas",
    "verify_group_access",
    "group-canvas",
  ],
  [
    "grant",
    "identity.group_grant:group-canvas",
    "grant_group_access",
    "group-canvas",
  ],
  ["sso", "identity.sso_provider_outage:true", "check_sso_health", undefined],
  ["disabled", "identity.suspended:true", undefined, undefined],
  ["mfa", "identity.mfa_not_registered:true", undefined, undefined],
];

export const identityCases: BenchmarkCase[] = scenarios.flatMap(
  ([suffix, description, capability, groupId]) =>
    [0, 1, 2].map((variant) => ({
      id: `identity-${suffix}-${variant + 1}`,
      suite: "identity",
      version: BENCHMARK_VERSION,
      category: "accounts",
      platform: "general" as const,
      ticket: { title: "Identity access issue", description },
      evidence: [
        {
          id: `identity-${suffix}-${variant + 1}-evidence`,
          kind: "hypothesis",
          summary: description,
          confidence: 0.9,
        },
      ],
      expected: {
        planner: capability
          ? ("propose_action" as const)
          : ("escalate" as const),
        ...(capability
          ? {
              capability: { id: capability, version: 1 },
              verificationMethod:
                capability === "grant_group_access" ||
                capability === "verify_group_access"
                  ? "directory_group_membership"
                  : capability === "revoke_user_sessions"
                    ? "directory_signin_after_action"
                    : capability === "send_password_reset_link"
                      ? "outbox_status_sent"
                      : "directory_status_read",
            }
          : {}),
        gatewayCode: capability ? "execution_disabled" : "not_reached",
        executed: false as const,
      },
      ...(groupId ? { diagnosticAnswers: [groupId] } : {}),
    }))
);
