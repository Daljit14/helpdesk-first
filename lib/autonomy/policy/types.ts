import type { StepRisk } from "@/lib/investigation/policy";
import type {
  CapabilityPlatform,
  CapabilitySideEffects,
} from "@/lib/autonomy/capabilities/types";

export const POLICY_VERSION = "2026-09-15.1";

export const POLICY_PRECEDENCE = [
  "deny",
  "specialist_only",
  "require_technician_approval",
  "require_user_consent",
  "allow_automatic",
] as const;

export type PolicyDecisionValue =
  | "allow_automatic"
  | "require_user_consent"
  | "require_technician_approval"
  | "specialist_only"
  | "deny";

export type PolicyActorRole =
  "system" | "requester" | "support_agent" | "org_admin";

export type DeviceOwnership = "org_managed" | "byod" | "unknown";

export type EvidenceQuality = "sufficient" | "partial" | "missing";

export type PolicyInput = {
  capability: {
    id: string;
    version: number;
    riskLevel: StepRisk;
    sideEffects: CapabilitySideEffects;
    consent: "none" | "user" | "technician";
    orgPolicyRequirements: string[];
    platforms: CapabilityPlatform[];
  };
  organization: {
    capabilityEnabled: boolean;
    grantedPolicies: string[];
    requireApprovalFor: string[];
  };
  actorRole: PolicyActorRole;
  deviceOwnership: DeviceOwnership;
  platform: CapabilityPlatform | null;
  ticketCategory: string | null;
  confidence: number | null;
  evidenceQuality: EvidenceQuality;
  consent: { user: boolean; technician: boolean };
  priorFailedAttempts: number;
  parametersValid: boolean;
  sensitivity: {
    credentialsDetected: boolean;
    piiDetected: boolean;
    studentData: boolean;
    securityIncident: boolean;
  };
  killSwitchActive: boolean;
  breakerOpen: boolean;
  conflictingEvidence?: boolean;
  capabilityStatus?:
    "active" | "deprecated" | "expired" | "unknown" | "disabled";
};

export type PolicyDecision = {
  decision: PolicyDecisionValue;
  reasons: string[];
  policyVersion: string;
  auditLabel: string;
  userLabel: string;
};

export function isMoreRestrictive(
  left: PolicyDecisionValue,
  right: PolicyDecisionValue
): boolean {
  return (
    POLICY_PRECEDENCE.indexOf(left as (typeof POLICY_PRECEDENCE)[number]) <=
    POLICY_PRECEDENCE.indexOf(right as (typeof POLICY_PRECEDENCE)[number])
  );
}
