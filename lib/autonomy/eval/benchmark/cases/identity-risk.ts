import { BENCHMARK_VERSION } from "../version";
import type { BenchmarkCase } from "../types";
import type { RiskReason } from "@/lib/identity/risk";

type StaffVerificationScenario = NonNullable<
  NonNullable<BenchmarkCase["identityAssurance"]>["staff"]
>["verification"];

const base = {
  version: BENCHMARK_VERSION,
  platform: "general" as const,
  category: "account" as const,
  ticket: {
    title: "Reset my password",
    description: "I need help with my account.",
  },
  evidence: [
    {
      id: "identity-risk-evidence",
      kind: "identity",
      summary: "Requester is verified.",
      confidence: 0.85,
    },
  ],
  identity: { bound: true, allowedGroupIds: [] },
  expected: {
    planner: "propose_action" as const,
    capability: { id: "send_password_reset_link", version: 1 },
    policy: "allow_automatic" as const,
    executed: false as const,
  },
};

function requesterRiskCase(input: {
  id: string;
  signals: RiskReason[];
  enabled?: boolean;
  level?: "A0" | "A1" | "A3";
  title?: string;
  description?: string;
  gatewayCode: string;
}): BenchmarkCase {
  return {
    ...base,
    id: input.id,
    suite: "identity_risk",
    ticket: {
      title: input.title ?? base.ticket.title,
      description: input.description ?? base.ticket.description,
    },
    identityAssurance: {
      mode: "gateway",
      level: input.level ?? "A3",
      channel: "web",
      flagEnabled: true,
      expired: false,
      invalidParameters: false,
      consentType: "user_consent",
      capabilityId: "send_password_reset_link",
      risk: {
        signals: input.signals,
        enabled: input.enabled ?? true,
      },
    },
    expected: {
      ...base.expected,
      gatewayCode: input.gatewayCode,
      assuranceLevel: input.level ?? "A3",
    },
  };
}

function staffCase(input: {
  id: string;
  verification: StaffVerificationScenario;
  privileged?: boolean;
  enabled?: boolean;
  consentType?: "user_consent" | "technician_approval";
  signals?: RiskReason[];
  riskEnabled?: boolean;
  level?: "A1" | "A3";
  ticket?: { title: string; description: string };
  gatewayCode: string;
}): BenchmarkCase {
  return {
    ...base,
    id: input.id,
    suite: "staff_verification",
    ticket: input.ticket ?? base.ticket,
    identityAssurance: {
      mode: "gateway",
      level: input.level ?? "A0",
      channel: "web",
      flagEnabled: true,
      expired: false,
      invalidParameters: false,
      capabilityId: "send_password_reset_link",
      consentType: input.consentType ?? "technician_approval",
      risk: {
        signals: input.signals ?? [],
        enabled: input.riskEnabled ?? false,
      },
      staff: {
        enabled: input.enabled ?? true,
        verification: input.verification,
        privileged: input.privileged ?? false,
      },
    },
    expected: {
      ...base.expected,
      gatewayCode: input.gatewayCode,
      assuranceLevel:
        (input.consentType ?? "technician_approval") ===
          "technician_approval" &&
        input.enabled !== false &&
        ["valid", "valid_with_manager"].includes(input.verification)
          ? "A3"
          : (input.level ?? "A0"),
    },
  };
}

export const identityRiskCases: BenchmarkCase[] = [
  requesterRiskCase({
    id: "identity-risk-high-country-and-mfa",
    signals: ["new_sign_in_country", "mfa_changed_7d"],
    gatewayCode: "identity_risk_high",
  }),
  requesterRiskCase({
    id: "identity-risk-high-repeat-request",
    signals: ["repeat_account_request_24h"],
    gatewayCode: "identity_risk_high",
  }),
  requesterRiskCase({
    id: "identity-risk-high-privileged-account",
    signals: ["privileged_account"],
    gatewayCode: "identity_risk_high",
  }),
  requesterRiskCase({
    id: "identity-risk-high-other-person-email",
    signals: ["names_other_person"],
    title: "Reset another person's password",
    description: "Please reset alex@example.net's password.",
    gatewayCode: "identity_risk_high",
  }),
  requesterRiskCase({
    id: "identity-risk-elevated-stale-a3",
    signals: ["new_device_24h"],
    gatewayCode: "step_up_required",
  }),
  requesterRiskCase({
    id: "identity-risk-elevated-fresh-a3",
    signals: ["new_device_24h"],
    gatewayCode: "attempts_exhausted",
  }),
  requesterRiskCase({
    id: "identity-risk-none",
    signals: [],
    gatewayCode: "attempts_exhausted",
  }),
  requesterRiskCase({
    id: "identity-risk-flags-off",
    signals: ["repeat_account_request_24h"],
    enabled: false,
    gatewayCode: "attempts_exhausted",
  }),
  staffCase({
    id: "identity-staff-missing-verification",
    verification: "none",
    gatewayCode: "staff_verification_required",
  }),
  staffCase({
    id: "identity-staff-other-ticket",
    verification: "other_ticket",
    gatewayCode: "staff_verification_required",
  }),
  staffCase({
    id: "identity-staff-other-subject",
    verification: "other_subject",
    gatewayCode: "staff_verification_required",
  }),
  staffCase({
    id: "identity-staff-expired",
    verification: "expired",
    gatewayCode: "staff_verification_required",
  }),
  staffCase({
    id: "identity-staff-privileged-missing-manager",
    verification: "missing_manager",
    privileged: true,
    gatewayCode: "staff_verification_required",
  }),
  staffCase({
    id: "identity-staff-valid-callback",
    verification: "valid",
    gatewayCode: "attempts_exhausted",
  }),
  staffCase({
    id: "identity-staff-valid-privileged",
    verification: "valid_with_manager",
    privileged: true,
    gatewayCode: "attempts_exhausted",
  }),
  staffCase({
    id: "identity-staff-overrides-risk",
    verification: "valid",
    signals: ["repeat_account_request_24h"],
    riskEnabled: true,
    gatewayCode: "attempts_exhausted",
  }),
  staffCase({
    id: "identity-staff-not-user-consent",
    verification: "valid",
    consentType: "user_consent",
    level: "A1",
    gatewayCode: "assurance_insufficient",
  }),
  staffCase({
    id: "identity-staff-flag-off",
    verification: "valid",
    enabled: false,
    level: "A1",
    gatewayCode: "assurance_insufficient",
  }),
];
