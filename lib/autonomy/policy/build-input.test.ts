import { describe, expect, test } from "vitest";
import { CAPABILITIES } from "../capabilities/registry";
import type { EvidenceRecord } from "@/lib/evidence/types";
import { buildPolicyInput } from "./build-input";

const capability = CAPABILITIES.find(({ id }) => id === "route_to_department")!;

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    version: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    description: "Monitor issue",
    redaction: {},
    context: {
      platform: "Windows",
      os: "Windows 11",
      device: "Laptop",
      app: null,
      deviceOwnership: "organization",
    },
    attachmentFindings: [],
    qa: [],
    confirmedFacts: [],
    unknownFacts: [],
    hypotheses: [
      {
        id: "h1",
        cause: "Display driver",
        guideSlug: "display",
        rawConfidence: 0.72,
        confidence: 0.72,
        explanation: "Likely",
        supporting: [],
        rejecting: [],
      },
    ],
    citations: [],
    safetyWarnings: [],
    missingInformation: [],
    ...overrides,
  };
}

function params(
  overrides: Partial<Parameters<typeof buildPolicyInput>[0]> = {}
) {
  return {
    capability,
    capabilityEnabled: true,
    killSwitches: { anyActive: false },
    breaker: { open: false },
    actorRole: "requester" as const,
    platform: "Windows" as const,
    ticketCategory: "display",
    consent: { user: false, technician: false },
    priorFailedAttempts: 0,
    parametersValid: true,
    orgPolicy: {
      grantedPolicies: ["autonomy.routing"],
      requireApprovalFor: [],
    },
    ...overrides,
  };
}

describe("buildPolicyInput", () => {
  test("maps evidence ownership, confidence, quality, and sensitivity", () => {
    const result = buildPolicyInput(
      params({
        evidence: evidence({
          context: {
            ...evidence().context,
            deviceOwnership: "personal",
          },
          hypotheses: [
            evidence().hypotheses[0],
            { ...evidence().hypotheses[0], id: "h2", confidence: 0.91 },
          ],
          redaction: { credential: 1, email: 1 },
        }),
        studentData: true,
        securityIncident: true,
      })
    );
    expect(result.deviceOwnership).toBe("byod");
    expect(result.confidence).toBe(0.91);
    expect(result.evidenceQuality).toBe("sufficient");
    expect(result.sensitivity).toEqual({
      credentialsDetected: true,
      piiDetected: true,
      studentData: true,
      securityIncident: true,
    });
  });

  test.each([
    ["organization", "org_managed"],
    ["personal", "byod"],
    ["unknown", "unknown"],
  ] as const)("maps %s ownership", (source, expected) => {
    expect(
      buildPolicyInput(
        params({
          evidence: evidence({
            context: { ...evidence().context, deviceOwnership: source },
          }),
        })
      ).deviceOwnership
    ).toBe(expected);
  });

  test("marks partial evidence for missing information or no hypotheses", () => {
    expect(
      buildPolicyInput(
        params({
          evidence: evidence({ missingInformation: ["device"] }),
        })
      ).evidenceQuality
    ).toBe("partial");
    expect(
      buildPolicyInput(params({ evidence: evidence({ hypotheses: [] }) }))
        .evidenceQuality
    ).toBe("partial");
  });

  test("maps no evidence to missing and null confidence", () => {
    const result = buildPolicyInput(params({ evidence: null }));
    expect(result).toMatchObject({
      deviceOwnership: "unknown",
      confidence: null,
      evidenceQuality: "missing",
      sensitivity: {
        credentialsDetected: false,
        piiDetected: false,
      },
    });
  });
});
