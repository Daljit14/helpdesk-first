import type { EvidenceRecord } from "@/lib/evidence/types";
import type {
  CapabilityDefinition,
  CapabilityPlatform,
} from "../capabilities/types";
import type { DeviceOwnership, PolicyActorRole, PolicyInput } from "./types";

export type BuildPolicyInputParams = {
  capability: CapabilityDefinition;
  capabilityEnabled: boolean;
  killSwitches: { anyActive: boolean };
  breaker: { open: boolean };
  evidence?: EvidenceRecord | null;
  actorRole: PolicyActorRole;
  platform: CapabilityPlatform | null;
  ticketCategory: string | null;
  consent: { user: boolean; technician: boolean };
  priorFailedAttempts: number;
  parametersValid: boolean;
  orgPolicy: {
    grantedPolicies: string[];
    requireApprovalFor: string[];
  };
  capabilityStatus?: PolicyInput["capabilityStatus"];
  studentData?: boolean;
  securityIncident?: boolean;
  plannerDisagreement?: boolean;
};

function ownershipFor(
  ownership: EvidenceRecord["context"]["deviceOwnership"] | undefined
): DeviceOwnership {
  if (ownership === "organization") return "org_managed";
  if (ownership === "personal") return "byod";
  return "unknown";
}

function confidenceFor(
  evidence: EvidenceRecord | null | undefined
): number | null {
  if (!evidence || evidence.hypotheses.length === 0) return null;
  return Math.max(...evidence.hypotheses.map(({ confidence }) => confidence));
}

function evidenceQualityFor(
  evidence: EvidenceRecord | null | undefined
): PolicyInput["evidenceQuality"] {
  if (!evidence) return "missing";
  if (
    evidence.missingInformation.length > 0 ||
    evidence.hypotheses.length === 0
  ) {
    return "partial";
  }
  return "sufficient";
}

function conflictingEvidenceFor(
  evidence: EvidenceRecord | null | undefined
): boolean {
  if (!evidence) return false;
  const record = evidence as EvidenceRecord & {
    contradictions?: unknown[];
  };
  if (
    Array.isArray(record.contradictions) &&
    record.contradictions.length > 0
  ) {
    return true;
  }
  return evidence.hypotheses.some(
    (hypothesis) =>
      hypothesis.supporting.length > 0 && hypothesis.rejecting.length > 0
  );
}

export function buildPolicyInput({
  capability,
  capabilityEnabled,
  killSwitches,
  breaker,
  evidence = null,
  actorRole,
  platform,
  ticketCategory,
  consent,
  priorFailedAttempts,
  parametersValid,
  orgPolicy,
  capabilityStatus,
  studentData = false,
  securityIncident = false,
  plannerDisagreement = false,
}: BuildPolicyInputParams): PolicyInput {
  const redaction = evidence?.redaction ?? {};
  return {
    capability: {
      id: capability.id,
      version: capability.version,
      riskLevel: capability.riskLevel,
      sideEffects: capability.sideEffects,
      consent: capability.consent,
      orgPolicyRequirements: [...capability.orgPolicyRequirements],
      platforms: [...capability.platforms],
    },
    organization: {
      capabilityEnabled,
      grantedPolicies: [...orgPolicy.grantedPolicies],
      requireApprovalFor: [...orgPolicy.requireApprovalFor],
    },
    actorRole,
    deviceOwnership: ownershipFor(evidence?.context.deviceOwnership),
    platform,
    ticketCategory,
    confidence: confidenceFor(evidence),
    evidenceQuality: evidenceQualityFor(evidence),
    consent: { ...consent },
    priorFailedAttempts,
    parametersValid,
    sensitivity: {
      credentialsDetected: (redaction.credential ?? 0) > 0,
      piiDetected:
        (redaction.email ?? 0) > 0 ||
        (redaction.name ?? 0) > 0 ||
        (redaction.identifier ?? 0) > 0,
      studentData,
      securityIncident,
    },
    killSwitchActive: killSwitches.anyActive,
    breakerOpen: breaker.open,
    conflictingEvidence: conflictingEvidenceFor(evidence),
    capabilityStatus: capabilityStatus ?? "active",
    plannerDisagreement,
  };
}
