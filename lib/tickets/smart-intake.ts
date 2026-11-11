import { isSmartIntakeEnabled } from "@/lib/admin/flags";
import {
  diagnosticQuestions,
  type AiIntakeOutput,
  type DiagnosticQuestion,
} from "@/lib/ai/types";
import {
  loadConfirmedOrgEnvironment,
  profileAnswers,
} from "@/lib/org-environment/profile";
import type { RouteDecision } from "@/lib/tickets/routing";
import type { createAdminClient } from "@/lib/supabase/admin";

export const SMART_INTAKE_MAX_QUESTIONS = 2;
export const CLARIFY_EVENT = "ai.clarify_requested";

const CLARIFY_REASONS = new Set([
  "low_confidence",
  "no_approved_guide",
  "insufficient_diagnostics",
]);
const FALLBACK_QUESTION_IDS = ["error-message", "when-started"];

/**
 * Ask instead of handing off only when triage is unsure (not for safety,
 * explicit human requests, repeated failures or high-risk guides) and the
 * ticket still has clarifying questions left.
 */
export function shouldClarify(input: {
  decision: RouteDecision;
  ai: AiIntakeOutput;
  safetyFlags: string[];
  alreadyAsked: number;
  organizationId: string | null;
}): boolean {
  return (
    isSmartIntakeEnabled() &&
    input.organizationId !== null &&
    input.decision.resolver === "human" &&
    CLARIFY_REASONS.has(input.decision.reason) &&
    input.safetyFlags.length === 0 &&
    input.alreadyAsked < SMART_INTAKE_MAX_QUESTIONS &&
    (input.ai.decision === "clarify" ||
      input.decision.reason === "low_confidence")
  );
}

export function pickClarifyingQuestions(input: {
  proposedIds: string[];
  answeredIds: string[];
  alreadyAsked: number;
  categoryId: string | null;
}): DiagnosticQuestion[] {
  const remaining = SMART_INTAKE_MAX_QUESTIONS - input.alreadyAsked;
  if (remaining <= 0) return [];
  const answered = new Set(input.answeredIds);
  const ordered = [
    ...new Set([...input.proposedIds, ...FALLBACK_QUESTION_IDS]),
  ];
  return ordered
    .map((id) => diagnosticQuestions.find((question) => question.id === id))
    .filter((question): question is DiagnosticQuestion => Boolean(question))
    .filter((question) => !answered.has(question.id))
    .filter(
      (question) =>
        !question.categoryIds ||
        !input.categoryId ||
        question.categoryIds.includes(input.categoryId)
    )
    .slice(0, remaining);
}

/** Question IDs the organization profile already answers. */
export async function profileAnsweredIds(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string
): Promise<string[]> {
  try {
    const profile = await loadConfirmedOrgEnvironment(admin, organizationId);
    return profile ? profileAnswers(profile).map((a) => a.questionId) : [];
  } catch {
    return [];
  }
}

export function clarifyCommentText(questions: DiagnosticQuestion[]): string {
  const lines = questions.map(
    (question, index) => `${index + 1}. ${question.text}`
  );
  return [
    "Before I pass this to the IT team, I need a little more detail:",
    ...lines,
    "Reply to this ticket with your answers.",
  ].join("\n");
}

export function answersFromReply(
  questionIds: string[],
  reply: string
): Array<{ questionId: string; answer: string }> {
  const answer = reply.trim().slice(0, 500);
  return questionIds.map((questionId) => ({ questionId, answer }));
}
