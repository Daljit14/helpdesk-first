import { z } from "zod";

const evidenceFixture = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    summary: z.string().min(1),
    confidence: z.number().min(0).max(1).default(0.85),
    supporting: z.array(z.string().min(1)).optional(),
    rejecting: z.array(z.string().min(1)).optional(),
  })
  .strict();

const attachment = z
  .object({
    filename: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
    text: z.string().optional(),
  })
  .strict();

const expected = z
  .object({
    planner: z.enum(["propose_action", "escalate", "no_action"]),
    capability: z
      .object({ id: z.string(), version: z.number().int().positive() })
      .strict()
      .optional(),
    policy: z
      .enum([
        "allow_automatic",
        "require_user_consent",
        "require_technician_approval",
        "specialist_only",
        "deny",
      ])
      .optional(),
    verificationMethod: z.string().optional(),
    inputBlocked: z.boolean().optional(),
    outputRejected: z.boolean().optional(),
    rejectCode: z.string().optional(),
    gatewayCode: z.string().optional(),
    assuranceLevel: z.enum(["A0", "A1", "A2", "A3"]).optional(),
    researchConfidence: z.number().min(0).max(1).optional(),
    researchPresent: z.boolean().optional(),
    researchInfluencedNonSafe: z.boolean().optional(),
    researchProviderCalls: z.number().int().nonnegative().optional(),
    researchTrusts: z
      .array(z.enum(["vendor", "community", "reference"]))
      .optional(),
    researchGuardrailEvents: z.number().int().nonnegative().optional(),
    researchParameterLeak: z.boolean().optional(),
    serviceIncidentActionRejected: z.boolean().optional(),
    userStepEmitted: z.boolean().optional(),
    userStepRejectCode: z
      .enum([
        "unapproved_source",
        "step_not_found",
        "step_blocked",
        "community_source",
        "reference_source",
      ])
      .optional(),
    auditChainOk: z.boolean().optional(),
    auditChainFirstBreakId: z.string().optional(),
    taintedProposal: z.boolean().optional(),
    instructionContentWithheld: z.boolean().optional(),
    hypothesisIncludes: z.array(z.string()).optional(),
    safetyWarningIncludes: z.array(z.string()).optional(),
    deviceHypothesisConfidenceBelow: z.number().min(0).max(1).optional(),
    executed: z.boolean(),
  })
  .strict();

const identity = z
  .object({
    bound: z.boolean(),
    directory: z
      .object({
        directoryUserId: z.string(),
        primaryEmail: z.string().email(),
        enabled: z.boolean().default(true),
        suspended: z.boolean().default(false),
        groups: z.array(z.string()).default([]),
      })
      .strict()
      .optional(),
    allowedGroupIds: z.array(z.string()).default([]),
  })
  .strict();

const identityAssurance = z
  .object({
    mode: z.enum(["gateway", "channel"]),
    level: z.enum(["A0", "A1", "A2", "A3"]),
    channel: z.enum(["web", "email", "api", "ticket_owner_web"]).default("web"),
    flagEnabled: z.boolean().default(true),
    capabilityId: z.string().optional(),
    expired: z.boolean().default(false),
    invalidParameters: z.boolean().default(false),
  })
  .strict();

const research = z
  .object({
    sources: z.array(
      z
        .object({
          url: z.string().url(),
          title: z.string(),
          snippet: z.string(),
          judgement: z
            .enum(["supports", "contradicts", "irrelevant", "unjudged"])
            .optional(),
          hypothesisId: z.string().nullable().optional(),
        })
        .strict()
    ),
    failure: z.enum(["timeout", "too_large", "rate_limited"]).optional(),
    enabled: z.boolean().optional(),
    budgetExhausted: z.boolean().optional(),
    familyAllowlisted: z.boolean().optional(),
  })
  .strict();

const webSearchSource = z
  .object({
    url: z.string().url(),
    domain: z.string().min(1),
    title: z.string(),
    snippet: z.string(),
    trust: z.enum(["vendor", "community", "reference"]),
    contentHash: z.string().min(1),
    fetchedAt: z.string().min(1),
  })
  .strict();

const device = z
  .object({
    platform: z.enum(["windows", "macos", "linux"]),
    deviceClass: z.enum(["managed", "byod"]).optional(),
    deviceConsentPolicies: z
      .array(
        z
          .object({
            deviceClass: z.enum(["managed", "byod"]),
            category: z.enum(["network", "security", "endpoint", "peripheral"]),
            autoApprove: z.boolean(),
          })
          .strict()
      )
      .optional(),
    stale: z.boolean().optional(),
    diagnostics: z.array(
      z
        .object({
          kind: z.string(),
          ok: z.boolean(),
          summary: z.string(),
          data: z
            .record(
              z.string(),
              z.union([
                z.string(),
                z.number(),
                z.boolean(),
                z.null(),
                z.array(z.string().max(80)).max(40),
              ])
            )
            .optional(),
        })
        .strict()
    ),
  })
  .strict();

const requesterAgentOutput = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("tool_use"),
      id: z.string(),
      name: z.string(),
      input: z.unknown(),
      summary: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("final"),
      text: z.string(),
      confidence: z.number(),
      summary: z.string(),
    })
    .strict(),
  z.object({ kind: z.literal("invalid"), raw: z.string() }).strict(),
]);

const requesterAgent = z
  .object({
    message: z.string().min(1),
    outputs: z.array(requesterAgentOutput),
    toolResults: z
      .array(
        z
          .object({
            ok: z.boolean(),
            value: z.unknown().optional(),
            modelText: z.string().optional(),
            userSummary: z.string().optional(),
            code: z.string().optional(),
            sideEffects: z.boolean().optional(),
          })
          .strict()
      )
      .optional(),
    killSwitchAfterTool: z.boolean().optional(),
    maxToolCalls: z.number().int().positive().optional(),
    forbiddenInReply: z.array(z.string()).optional(),
    requiredInReply: z.array(z.string()).optional(),
    requesterIdentifiers: z.array(z.string()).optional(),
    humanRequested: z.boolean().optional(),
    userStepsEnabled: z.boolean().optional(),
    approvedSlugs: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).optional(),
    expectUserStepRejected: z.boolean().optional(),
    serviceHealthEnabled: z.boolean().optional(),
    orgEnvironmentEnabled: z.boolean().optional(),
    diagnosticSourcesEnabled: z.boolean().optional(),
    forbiddenInModelInput: z.array(z.string()).optional(),
    serviceIncidentActive: z.boolean().optional(),
    modelRoute: z.enum(["default", "planner"]).optional(),
    webSearch: z
      .object({
        sources: z.array(webSearchSource),
        requesterNameTerms: z.array(z.string()).optional(),
        vendorDomains: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    realEvidenceCheck: z.boolean().optional(),
    forbiddenInProviderQuery: z.array(z.string()).optional(),
    expectActionRejectedCode: z.string().optional(),
    expectedCitationDomain: z.string().optional(),
    expectedWebSearchSourceCount: z.number().int().nonnegative().optional(),
    expectedProviderQueryCount: z.number().int().nonnegative().optional(),
    expectInstructionWithheld: z.boolean().optional(),
    consent: z
      .object({
        approvalRequestId: z.string(),
        decision: z.enum(["approve", "decline"]),
        reconfirmTainted: z.boolean().optional(),
      })
      .strict()
      .optional(),
    actionOutcome: z.unknown().optional(),
    consentResult: z.string().optional(),
    confirmResult: z.string().optional(),
    attachmentIds: z.array(z.string().uuid()).max(2).optional(),
    screenshotText: z.string().optional(),
    screenshotStatus: z.enum(["rejected", "scanning", "foreign"]).optional(),
    visionEnabled: z.boolean().optional(),
    autonomyScenario: z
      .object({
        tier: z.enum(["consent", "autorun"]),
        sessionConsent: z.boolean(),
        denylisted: z.boolean().optional(),
        rollbackFailed: z.boolean().optional(),
      })
      .strict()
      .optional(),
    priorFinalText: z.string().optional(),
  })
  .strict();

const taintScenario = z
  .object({
    capabilityId: z.string().min(1),
    autorunEligible: z.boolean(),
    reconfirmTainted: z.boolean().optional(),
  })
  .strict();

const replyQuality = z
  .object({
    fixtureId: z.string().min(1),
  })
  .strict();

const blastRadius = z
  .object({
    capabilityId: z.string().min(1),
    seed: z
      .array(
        z
          .object({
            org: z.union([z.literal(1), z.literal(2), z.literal(3)]),
            capabilityId: z.string().min(1),
            status: z.enum(["succeeded", "failed", "timed_out"]),
            minutesAgo: z.number().nonnegative(),
            rolledBack: z.boolean().optional(),
            verificationFailed: z.boolean().optional(),
          })
          .strict()
      )
      .min(1),
    alreadyTripped: z.array(z.string().min(1)).optional(),
    orgHourlyLimit: z.number().int().positive().optional(),
    expectTrip: z.enum(["none", "capability", "global"]),
    expectLimitCode: z.literal("blast_radius_limit").optional(),
  })
  .strict();

export const benchmarkCaseSchema = z
  .object({
    id: z.string().min(1),
    suite: z.string().min(1),
    version: z.string().min(1),
    category: z.string().min(1),
    platform: z.enum([
      "mac",
      "windows",
      "general",
      "linux",
      "ios",
      "android",
      "unknown",
    ]),
    ticket: z.object({ title: z.string(), description: z.string() }).strict(),
    evidence: z.array(evidenceFixture),
    missingInformation: z.array(z.string().min(1)).optional(),
    priorAttempts: z
      .array(
        z
          .object({
            capabilityId: z.string().min(1),
            version: z.number().int().positive(),
            status: z.string().min(1),
          })
          .strict()
      )
      .optional(),
    attachments: z.array(attachment).optional(),
    diagnosticAnswers: z.array(z.string()).optional(),
    providerBehaviour: z
      .enum([
        "ok",
        "timeout",
        "malformed_json",
        "extra_fields",
        "executable_content",
        "foreign_ids",
        "unavailable",
      ])
      .optional(),
    replay: z.boolean().optional(),
    killSwitch: z
      .enum(["global", "organization", "capability", "provider", "breaker"])
      .optional(),
    pilot: z
      .enum(["org_removed", "capability_removed", "capability_not_allowlisted"])
      .optional(),
    consent: z
      .enum([
        "replay",
        "wrong_user",
        "wrong_org",
        "wrong_ticket",
        "hash_mismatch",
        "expired",
      ])
      .optional(),
    tenant: z.enum(["foreign_ticket"]).optional(),
    limit: z
      .enum(["attempts_exhausted", "budget_exhausted", "repeated_failure"])
      .optional(),
    identity: identity.optional(),
    identityAssurance: identityAssurance.optional(),
    research: research.optional(),
    device: device.optional(),
    requesterAgent: requesterAgent.optional(),
    taintScenario: taintScenario.optional(),
    blastRadius: blastRadius.optional(),
    auditChain: z.enum(["intact", "delete_middle"]).optional(),
    honestMetrics: z
      .enum([
        "abandoned",
        "pending_72h",
        "staff_touched_after_resolve",
        "same_requester_24h_rereport",
        "came_back_feedback",
        "mixed",
      ])
      .optional(),
    replyQuality: replyQuality.optional(),
    expected,
  })
  .strict();

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type EvidenceFixture = BenchmarkCase["evidence"][number];
export type BenchmarkExpected = BenchmarkCase["expected"];
