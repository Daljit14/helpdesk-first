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
    gatewayCode: z.string().optional(),
    researchConfidence: z.number().min(0).max(1).optional(),
    researchPresent: z.boolean().optional(),
    researchInfluencedNonSafe: z.boolean().optional(),
    researchProviderCalls: z.number().int().nonnegative().optional(),
    researchTrusts: z.array(z.enum(["vendor", "community"])).optional(),
    researchGuardrailEvents: z.number().int().nonnegative().optional(),
    researchParameterLeak: z.boolean().optional(),
    executed: z.literal(false),
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
    research: research.optional(),
    expected,
  })
  .strict();

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type EvidenceFixture = BenchmarkCase["evidence"][number];
export type BenchmarkExpected = BenchmarkCase["expected"];
