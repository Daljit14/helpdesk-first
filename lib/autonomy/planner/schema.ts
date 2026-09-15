import { z } from "zod";
import { isSafeString } from "@/lib/ai/safety-policy";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        isSafeString(value) &&
        !/\b(?:ignore|disregard)\s+(?:all\s+)?previous\s+instructions\b/i.test(
          value
        ) &&
        !/\b(?:run|execute)\s+(?:rm\s+-rf|powershell|cmd(?:\.exe)?|sudo)\b/i.test(
          value
        ),
      { message: "unsafe text" }
    );

export const plannerCapabilitySchema = z
  .object({
    diagnosis: safeText(500),
    capabilityId: z.string().regex(/^[a-z_]{3,64}$/),
    capabilityVersion: z.number().int().min(1),
    parameters: z.record(z.string(), z.unknown()),
    expectedEvidence: z.array(safeText(200)).min(1).max(5),
  })
  .strict();

export const plannerEscalateSchema = z
  .object({
    decision: z.literal("escalate"),
    reason: safeText(200),
  })
  .strict();

export const plannerOutputSchema = z.union([
  plannerCapabilitySchema,
  plannerEscalateSchema,
]);

export type PlannerCapabilityPlan = z.infer<typeof plannerCapabilitySchema>;
export type PlannerEscalatePlan = z.infer<typeof plannerEscalateSchema>;
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export function isEscalatePlan(
  plan: PlannerOutput
): plan is PlannerEscalatePlan {
  return "decision" in plan && plan.decision === "escalate";
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

export function parsePlannerOutput(
  raw: unknown
): { ok: true; value: PlannerOutput } | { ok: false; issues: string[] } {
  let candidate: unknown = raw;
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
