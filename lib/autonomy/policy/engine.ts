import type { StepRisk } from "@/lib/investigation/policy";
import {
  POLICY_VERSION,
  type PolicyDecision,
  type PolicyDecisionValue,
  type PolicyInput,
} from "./types";

export const AUTOMATIC_CONFIDENCE_THRESHOLD = 0.8;

const PROHIBITED_CATEGORIES = new Set([
  "credentials",
  "password",
  "mfa",
  "malware",
  "security_incident",
  "data_loss",
  "data_recovery",
  "destructive",
  "unsupported",
]);

export function auditLabelFor(decision: PolicyDecisionValue): string {
  switch (decision) {
    case "allow_automatic":
      return "Safe";
    case "require_user_consent":
      return "Caution";
    case "require_technician_approval":
      return "Approval";
    case "specialist_only":
      return "Specialist";
    case "deny":
      return "Denied";
  }
}

export function userLabelFor(decision: PolicyDecisionValue): string {
  return decision === "allow_automatic" ? "Safe" : "Confirm first";
}

function finish(
  decision: PolicyDecisionValue,
  reasons: string[]
): PolicyDecision {
  return {
    decision,
    reasons,
    policyVersion: POLICY_VERSION,
    auditLabel: auditLabelFor(decision),
    userLabel: userLabelFor(decision),
    consentSatisfied: false,
  };
}

function riskAtLeast(risk: StepRisk, floor: StepRisk): boolean {
  const order: StepRisk[] = [
    "safe",
    "caution",
    "approval",
    "specialist",
    "denied",
  ];
  return order.indexOf(risk) >= order.indexOf(floor);
}

export function decidePolicy(input: PolicyInput): PolicyDecision {
  const { capability: cap, organization: org, sensitivity } = input;
  const reasons: string[] = [];

  // 1. Hard stops → deny.
  if (input.killSwitchActive) reasons.push("kill_switch_active");
  if (input.breakerOpen) reasons.push("circuit_breaker_open");
  if (input.capabilityStatus === "unknown") reasons.push("capability_unknown");
  if (input.capabilityStatus === "expired") reasons.push("capability_expired");
  if (input.capabilityStatus === "disabled")
    reasons.push("capability_disabled");
  if (input.capabilityStatus && input.capabilityStatus !== "active") {
    if (!reasons.includes(`capability_${input.capabilityStatus}`)) {
      reasons.push(`capability_${input.capabilityStatus}`);
    }
  }
  if (!org.capabilityEnabled) reasons.push("capability_not_enabled_for_org");
  if (!input.parametersValid) reasons.push("parameters_invalid");
  if (cap.riskLevel === "denied") reasons.push("capability_risk_denied");
  if (
    input.ticketCategory &&
    PROHIBITED_CATEGORIES.has(input.ticketCategory.toLowerCase())
  )
    reasons.push(`prohibited_category:${input.ticketCategory.toLowerCase()}`);
  const missingOrgPolicies = cap.orgPolicyRequirements.filter(
    (requirement) => !org.grantedPolicies.includes(requirement)
  );
  if (!cap.platforms.includes("any")) {
    if (!input.platform) reasons.push("platform_unsupported:unknown");
    else if (!cap.platforms.includes(input.platform))
      reasons.push(`platform_unsupported:${input.platform}`);
  }
  if (input.actorRole === "requester" && cap.consent === "technician")
    reasons.push("technician_consent_capability_requested_by_requester");
  if (reasons.length > 0) return finish("deny", reasons);

  // 2. Specialist-only.
  if (cap.riskLevel === "specialist")
    reasons.push("capability_risk_specialist");
  if (sensitivity.credentialsDetected) reasons.push("credentials_detected");
  if (sensitivity.securityIncident) reasons.push("security_incident_flag");
  if (sensitivity.studentData && cap.sideEffects !== "read_only")
    reasons.push("student_data_with_write");
  if (input.evidenceQuality === "missing" && cap.sideEffects !== "read_only")
    reasons.push("evidence_missing");
  if (reasons.length > 0) return finish("specialist_only", reasons);

  if (input.device) {
    if (input.device.irreversible) {
      if (!input.consent.user) {
        return finish("require_user_consent", [
          "device_irreversible_consent_required",
        ]);
      }
      return finish("allow_automatic", [
        "device_irreversible_consent_required",
        "user_consent_active",
      ]);
    }
    if (input.capability.sideEffects === "read_only")
      return finish("allow_automatic", ["device_read_only_no_consent"]);
    if (input.device.preApproved) {
      return finish("allow_automatic", [
        `device_preapproved:${input.device.category}:${input.device.deviceClass}`,
      ]);
    }
    if (!input.consent.user) {
      return finish("require_user_consent", [
        `device_consent_required:${input.device.category}:${input.device.deviceClass}`,
      ]);
    }
    return finish("allow_automatic", ["device_consent_active"]);
  }

  if (input.conflictingEvidence) {
    return finish("require_user_consent", ["evidence_conflicting"]);
  }
  if (input.plannerDisagreement && cap.riskLevel !== "safe") {
    return finish("require_user_consent", ["planner_disagreement"]);
  }
  if (input.evidenceContradiction === true && cap.riskLevel !== "safe") {
    return finish("require_user_consent", ["evidence_contradiction"]);
  }
  if (missingOrgPolicies.length > 0) {
    return finish(
      "require_technician_approval",
      missingOrgPolicies.map(
        (requirement) => `org_policy_missing:${requirement}`
      )
    );
  }

  // 3. Technician approval.
  if (cap.riskLevel === "approval") reasons.push("capability_risk_approval");
  if (cap.consent === "technician")
    reasons.push("capability_requires_technician_consent");
  if (
    cap.sideEffects === "external_write" &&
    input.deviceOwnership !== "org_managed"
  )
    reasons.push(`external_write_on_${input.deviceOwnership}_device`);
  if (org.requireApprovalFor.includes(cap.id))
    reasons.push("org_requires_approval_for_capability");
  if (sensitivity.piiDetected && cap.sideEffects === "external_write")
    reasons.push("pii_with_external_write");
  if (reasons.length > 0) {
    if (input.consent.technician && !org.requireApprovalFor.includes(cap.id)) {
      return finish("allow_automatic", [
        ...reasons,
        "technician_consent_active",
      ]);
    }
    return finish("require_technician_approval", reasons);
  }

  // 4. User consent.
  if (riskAtLeast(cap.riskLevel, "caution"))
    reasons.push("capability_risk_caution");
  if (cap.consent === "user") reasons.push("capability_requires_user_consent");
  if (
    input.confidence === null ||
    input.confidence < AUTOMATIC_CONFIDENCE_THRESHOLD
  )
    reasons.push("confidence_below_threshold");
  if (input.evidenceQuality !== "sufficient")
    reasons.push("evidence_not_sufficient");
  if (input.priorFailedAttempts >= 1) reasons.push("prior_failed_attempts");
  if (reasons.length > 0) {
    if (input.consent.user) {
      return finish("allow_automatic", [...reasons, "user_consent_active"]);
    }
    return finish("require_user_consent", reasons);
  }

  // 5. Automatic.
  return finish("allow_automatic", [
    "capability_risk_safe",
    "confidence_at_or_above_threshold",
    "evidence_sufficient",
  ]);
}
