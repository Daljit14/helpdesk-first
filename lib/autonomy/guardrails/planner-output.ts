import { z } from "zod";
import { isSafeString } from "@/lib/ai/safety-policy";
import { validateCapabilityInput } from "../capabilities/registry";
import type { CapabilityDefinition } from "../capabilities/types";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        isSafeString(value) &&
        !EXECUTABLE_CONTENT.some((pattern) => pattern.test(value)),
      { message: "unsafe text" }
    );

const primitive = z.union([
  z.string().max(200),
  z.number(),
  z.boolean(),
  z.null(),
]);
const parameters = z
  .record(z.string(), primitive)
  .refine((value) => Object.keys(value).length <= 20, {
    message: "parameters exceed 20 keys",
  })
  .superRefine((value, context) => {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string" && !isSafeString(entry)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "unsafe text",
        });
      }
    }
  });

const diagnosis = z
  .object({
    summary: safeText(500),
    confidence: z.number().min(0).max(1),
    evidenceIds: z.array(z.string().min(1).max(200)).min(1).max(10),
  })
  .strict();

export const plannerCapabilitySchema = z
  .object({
    ticketId: z.string().uuid(),
    diagnosis,
    decision: z.literal("propose_action"),
    capability: z
      .object({
        id: z.string().regex(/^[a-z_]{3,64}$/),
        version: z.number().int().min(1),
        parameters,
      })
      .strict(),
    verificationMethod: z.string().min(1).max(200),
  })
  .strict();

export const plannerDecisionSchema = z
  .object({
    ticketId: z.string().uuid(),
    diagnosis,
    decision: z.enum(["escalate", "no_action"]),
    reason: safeText(200),
  })
  .strict();

export const plannerOutputSchema = z.union([
  plannerCapabilitySchema,
  plannerDecisionSchema,
]);

export type PlannerPlanV2 = z.infer<typeof plannerCapabilitySchema>;
export type PlannerDecisionV2 = z.infer<typeof plannerDecisionSchema>;
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export type GuardrailRejectCode =
  | "schema_invalid"
  | "ticket_mismatch"
  | "evidence_unknown"
  | "capability_unknown"
  | "capability_version_invalid"
  | "capability_disabled"
  | "parameters_invalid"
  | "verification_unsupported"
  | "executable_content";

const EXECUTABLE_CONTENT = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash)\b/i,
  /\bpowershell\b|\bcmd\s*\/c\b|\breg\s+add\b|\bbcdedit\b|\bnetsh\b/i,
  /\b(?:select\s+.+\s+from|drop\s+table|insert\s+into|update\s+.+\s+set|delete\s+from)\b/i,
  /;--/i,
  /https?:\/\//i,
  /\beval\s*\(|\bFunction\s*\(|`[^`]*`|<script\b|\b(?:import|require)\s*\(/i,
];

function containsExecutableContent(value: unknown): boolean {
  if (typeof value === "string") {
    return EXECUTABLE_CONTENT.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) return value.some(containsExecutableContent);
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, entry]) =>
        containsExecutableContent(key) || containsExecutableContent(entry)
    );
  }
  return false;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

export function validatePlannerOutput(
  raw: unknown,
  context: {
    runTicketId: string;
    evidenceIds: string[];
    capability: CapabilityDefinition | null;
    orgEnabled: boolean;
    capabilityIdKnown?: boolean;
  }
):
  | { ok: true; plan: PlannerOutput }
  | { ok: false; code: GuardrailRejectCode; issues: string[] } {
  let candidate = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(stripCodeFences(raw));
    } catch {
      return {
        ok: false,
        code: "schema_invalid",
        issues: ["planner output is not valid JSON"],
      };
    }
  }
  if (containsExecutableContent(candidate)) {
    return {
      ok: false,
      code: "executable_content",
      issues: ["planner output contains executable content"],
    };
  }
  const parsed = plannerOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      code: "schema_invalid",
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`
      ),
    };
  }
  const plan = parsed.data;
  if (plan.ticketId !== context.runTicketId) {
    return {
      ok: false,
      code: "ticket_mismatch",
      issues: ["ticketId mismatch"],
    };
  }
  for (const evidenceId of plan.diagnosis.evidenceIds) {
    if (!context.evidenceIds.includes(evidenceId)) {
      return {
        ok: false,
        code: "evidence_unknown",
        issues: [`unknown evidence id: ${evidenceId}`],
      };
    }
  }
  if (plan.decision !== "propose_action") return { ok: true, plan };
  const capability = context.capability;
  if (!capability) {
    return {
      ok: false,
      code: context.capabilityIdKnown
        ? "capability_version_invalid"
        : "capability_unknown",
      issues: ["capability is not registered"],
    };
  }
  if (!context.orgEnabled) {
    return {
      ok: false,
      code: "capability_disabled",
      issues: ["capability is disabled for the organization"],
    };
  }
  const input = validateCapabilityInput(
    capability.id,
    capability.version,
    plan.capability.parameters
  );
  if (!input.ok) {
    return { ok: false, code: "parameters_invalid", issues: input.issues };
  }
  if (plan.verificationMethod !== capability.verification) {
    return {
      ok: false,
      code: "verification_unsupported",
      issues: ["verification method is not registered for the capability"],
    };
  }
  return { ok: true, plan };
}

export function parsePlannerOutput(
  raw: unknown
): { ok: true; value: PlannerOutput } | { ok: false; issues: string[] } {
  let candidate = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(stripCodeFences(raw));
    } catch {
      return { ok: false, issues: ["planner output is not valid JSON"] };
    }
  }
  const parsed = plannerOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`
      ),
    };
  }
  return { ok: true, value: parsed.data };
}

export function isEscalatePlan(plan: PlannerOutput): plan is PlannerDecisionV2 {
  return plan.decision === "escalate";
}

export { containsExecutableContent, safeText };
