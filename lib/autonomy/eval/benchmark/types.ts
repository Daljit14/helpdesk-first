import { z } from "zod";

const evidenceFixture = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    summary: z.string().min(1),
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
    executed: z.literal(false),
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
    attachments: z.array(attachment).optional(),
    diagnosticAnswers: z.array(z.string()).optional(),
    providerBehaviour: z
      .enum([
        "ok",
        "timeout",
        "malformed_json",
        "extra_fields",
        "foreign_ids",
        "unavailable",
      ])
      .optional(),
    replay: z.boolean().optional(),
    killSwitch: z
      .enum(["global", "organization", "capability", "provider", "breaker"])
      .optional(),
    expected,
  })
  .strict();

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type EvidenceFixture = BenchmarkCase["evidence"][number];
export type BenchmarkExpected = BenchmarkCase["expected"];
