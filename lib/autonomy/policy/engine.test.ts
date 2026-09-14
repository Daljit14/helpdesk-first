import { describe, expect, test } from "vitest";
import {
  AUTOMATIC_CONFIDENCE_THRESHOLD,
  auditLabelFor,
  decidePolicy,
  userLabelFor,
} from "./engine";
import { POLICY_VERSION, type PolicyInput } from "./types";

const baseline: PolicyInput = {
  capability: {
    id: "check_helpdesk_service_status",
    version: 1,
    riskLevel: "safe",
    sideEffects: "read_only",
    consent: "none",
    orgPolicyRequirements: [],
    platforms: ["any"],
  },
  organization: {
    capabilityEnabled: true,
    grantedPolicies: [],
    requireApprovalFor: [],
  },
  actorRole: "requester",
  deviceOwnership: "org_managed",
  platform: "Windows",
  ticketCategory: null,
  confidence: 0.9,
  evidenceQuality: "sufficient",
  consent: { user: false, technician: false },
  priorFailedAttempts: 0,
  parametersValid: true,
  sensitivity: {
    credentialsDetected: false,
    piiDetected: false,
    studentData: false,
    securityIncident: false,
  },
  killSwitchActive: false,
  breakerOpen: false,
};

function input(overrides: unknown = {}): PolicyInput {
  const partial = overrides as {
    capability?: Partial<PolicyInput["capability"]>;
    organization?: Partial<PolicyInput["organization"]>;
    consent?: Partial<PolicyInput["consent"]>;
    sensitivity?: Partial<PolicyInput["sensitivity"]>;
  } & Partial<
    Omit<PolicyInput, "capability" | "organization" | "consent" | "sensitivity">
  >;
  return {
    ...baseline,
    ...partial,
    capability: { ...baseline.capability, ...partial.capability },
    organization: { ...baseline.organization, ...partial.organization },
    consent: { ...baseline.consent, ...partial.consent },
    sensitivity: { ...baseline.sensitivity, ...partial.sensitivity },
  };
}

describe("decidePolicy", () => {
  test.each([
    ["kill switch", { killSwitchActive: true }, "kill_switch_active"],
    ["breaker", { breakerOpen: true }, "circuit_breaker_open"],
    [
      "disabled capability",
      { organization: { capabilityEnabled: false } },
      "capability_not_enabled_for_org",
    ],
    ["invalid parameters", { parametersValid: false }, "parameters_invalid"],
    [
      "denied risk",
      { capability: { riskLevel: "denied" } },
      "capability_risk_denied",
    ],
    [
      "malware category",
      { ticketCategory: "MaLwArE" },
      "prohibited_category:malware",
    ],
    [
      "missing policy",
      {
        capability: { orgPolicyRequirements: ["autonomy.notifications"] },
      },
      "org_policy_missing:autonomy.notifications",
    ],
    [
      "unsupported platform",
      { capability: { platforms: ["macOS"] }, platform: "Windows" },
      "platform_unsupported:Windows",
    ],
    [
      "requester technician capability",
      {
        actorRole: "requester",
        capability: { consent: "technician" },
      },
      "technician_consent_capability_requested_by_requester",
    ],
  ] as const)("denies for %s", (_name, overrides, reason) => {
    const result = decidePolicy(input(overrides));
    expect(result.decision).toBe("deny");
    expect(result.reasons).toContain(reason);
  });

  test("allows a granted organization policy", () => {
    const result = decidePolicy(
      input({
        capability: { orgPolicyRequirements: ["autonomy.notifications"] },
        organization: { grantedPolicies: ["autonomy.notifications"] },
      })
    );
    expect(result.decision).not.toBe("deny");
  });

  test.each([
    [
      "specialist risk",
      { capability: { riskLevel: "specialist" } },
      "capability_risk_specialist",
    ],
    [
      "credentials",
      { sensitivity: { credentialsDetected: true } },
      "credentials_detected",
    ],
    [
      "security incident",
      { sensitivity: { securityIncident: true } },
      "security_incident_flag",
    ],
    [
      "student data with write",
      {
        sensitivity: { studentData: true },
        capability: { sideEffects: "internal_write" },
      },
      "student_data_with_write",
    ],
    [
      "missing evidence with write",
      {
        evidenceQuality: "missing",
        capability: { sideEffects: "internal_write" },
      },
      "evidence_missing",
    ],
  ] as const)(
    "requires specialist handling for %s",
    (_name, overrides, reason) => {
      const result = decidePolicy(input(overrides));
      expect(result.decision).toBe("specialist_only");
      expect(result.reasons).toContain(reason);
    }
  );

  test("student data with read-only remains eligible", () => {
    expect(
      decidePolicy(
        input({
          sensitivity: { studentData: true },
          capability: { sideEffects: "read_only" },
        })
      ).decision
    ).toBe("allow_automatic");
  });

  test("missing evidence with read-only requires user consent", () => {
    const result = decidePolicy(
      input({
        evidenceQuality: "missing",
        capability: { sideEffects: "read_only" },
      })
    );
    expect(result.decision).toBe("require_user_consent");
    expect(result.reasons).toContain("evidence_not_sufficient");
  });

  test.each([
    [
      "approval risk",
      { capability: { riskLevel: "approval" } },
      "capability_risk_approval",
    ],
    [
      "external write on BYOD",
      {
        capability: { sideEffects: "external_write" },
        deviceOwnership: "byod",
      },
      "external_write_on_byod_device",
    ],
    [
      "external write on unknown",
      {
        capability: { sideEffects: "external_write" },
        deviceOwnership: "unknown",
      },
      "external_write_on_unknown_device",
    ],
    [
      "organization approval requirement",
      {
        organization: { requireApprovalFor: [baseline.capability.id] },
      },
      "org_requires_approval_for_capability",
    ],
    [
      "PII external write",
      {
        capability: { sideEffects: "external_write" },
        sensitivity: { piiDetected: true },
      },
      "pii_with_external_write",
    ],
  ] as const)(
    "requires technician approval for %s",
    (_name, overrides, reason) => {
      const result = decidePolicy(input(overrides));
      expect(result.decision).toBe("require_technician_approval");
      expect(result.reasons).toContain(reason);
    }
  );

  test("external write on managed device is not denied for ownership", () => {
    const result = decidePolicy(
      input({
        capability: { sideEffects: "external_write" },
        deviceOwnership: "org_managed",
      })
    );
    expect(result.reasons).not.toContain(
      "external_write_on_org_managed_device"
    );
  });

  test("technician consent allows an approval branch", () => {
    const result = decidePolicy(
      input({
        capability: { riskLevel: "approval" },
        consent: { technician: true },
      })
    );
    expect(result.decision).toBe("allow_automatic");
    expect(result.reasons).toContain("technician_consent_active");
  });

  test.each([
    [
      "caution risk",
      { capability: { riskLevel: "caution" } },
      "capability_risk_caution",
    ],
    ["low confidence", { confidence: 0.79 }, "confidence_below_threshold"],
    ["null confidence", { confidence: null }, "confidence_below_threshold"],
    [
      "partial evidence",
      { evidenceQuality: "partial" },
      "evidence_not_sufficient",
    ],
    ["prior failure", { priorFailedAttempts: 1 }, "prior_failed_attempts"],
  ] as const)("requires user consent for %s", (_name, overrides, reason) => {
    const result = decidePolicy(input(overrides));
    expect(result.decision).toBe("require_user_consent");
    expect(result.reasons).toContain(reason);
  });

  test("confidence threshold is inclusive", () => {
    expect(
      decidePolicy(input({ confidence: AUTOMATIC_CONFIDENCE_THRESHOLD }))
        .decision
    ).toBe("allow_automatic");
  });

  test("user consent allows a user-consent branch", () => {
    const result = decidePolicy(
      input({
        capability: { riskLevel: "caution" },
        consent: { user: true },
      })
    );
    expect(result.decision).toBe("allow_automatic");
    expect(result.reasons).toContain("user_consent_active");
  });

  test.each([
    ["approval", { capability: { riskLevel: "approval" } }],
    ["specialist", { capability: { riskLevel: "specialist" } }],
    ["denied", { capability: { riskLevel: "denied" } }],
  ] as const)("user consent does not bypass %s", (_name, overrides) => {
    const result = decidePolicy(
      input({ ...overrides, consent: { user: true } })
    );
    expect(result.decision).not.toBe("allow_automatic");
  });

  test("hard stops take precedence over specialist handling", () => {
    const result = decidePolicy(
      input({
        killSwitchActive: true,
        capability: { riskLevel: "specialist" },
      })
    );
    expect(result.decision).toBe("deny");
    expect(result.reasons).not.toEqual(
      expect.arrayContaining(["capability_risk_specialist"])
    );
  });

  test("specialist handling takes precedence over approval", () => {
    const result = decidePolicy(
      input({
        capability: { riskLevel: "specialist", sideEffects: "external_write" },
      })
    );
    expect(result.decision).toBe("specialist_only");
  });

  test("is deterministic and always includes policy metadata", () => {
    const first = decidePolicy(input());
    expect(first).toEqual(decidePolicy(input()));
    expect(first.reasons).not.toHaveLength(0);
    expect(first.policyVersion).toBe(POLICY_VERSION);
    expect(auditLabelFor("allow_automatic")).toBe("Safe");
    expect(userLabelFor("allow_automatic")).toBe("Safe");
    for (const decision of [
      "require_user_consent",
      "require_technician_approval",
      "specialist_only",
      "deny",
    ] as const) {
      expect(auditLabelFor(decision)).toMatch(
        /^(Caution|Approval|Specialist|Denied)$/
      );
      expect(userLabelFor(decision)).toBe("Confirm first");
    }
  });

  test("only safe, sufficiently evidenced combinations can allow automatically", () => {
    const risks = [
      "safe",
      "caution",
      "approval",
      "specialist",
      "denied",
    ] as const;
    const sideEffects = [
      "read_only",
      "internal_write",
      "external_write",
    ] as const;
    const ownership = ["org_managed", "byod", "unknown"] as const;
    const evidence = ["sufficient", "partial", "missing"] as const;
    for (const riskLevel of risks) {
      for (const sideEffect of sideEffects) {
        for (const deviceOwnership of ownership) {
          for (const evidenceQuality of evidence) {
            for (const killSwitchActive of [false, true]) {
              const result = decidePolicy(
                input({
                  capability: { riskLevel, sideEffects: sideEffect },
                  deviceOwnership,
                  evidenceQuality,
                  killSwitchActive,
                })
              );
              if (result.decision === "allow_automatic") {
                expect(killSwitchActive).toBe(false);
                expect(["safe", "caution"].includes(riskLevel)).toBe(true);
                expect(evidenceQuality).toBe("sufficient");
              }
            }
          }
        }
      }
    }
  });
});
