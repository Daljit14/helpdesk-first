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
/** One question per round, so each reply answers exactly one question. */
const QUESTIONS_PER_ROUND = 1;

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
  const remaining = Math.min(
    QUESTIONS_PER_ROUND,
    SMART_INTAKE_MAX_QUESTIONS - input.alreadyAsked
  );
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

type ClarifyEvent = { created_at: string; detail: unknown };
type Reply = { created_at: string; message: string | null };

function questionIdsOf(detail: unknown): string[] {
  const ids = (detail as { questionIds?: unknown } | null)?.questionIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

/**
 * Pairs each asked question with the requester's first reply after it (and
 * before the next question). Answers are rebuilt from the encrypted comments
 * on every round instead of being copied into plaintext ticket fields.
 */
export function rebuildClarifyAnswers(
  events: ClarifyEvent[],
  replies: Reply[]
): Array<{ questionId: string; answer: string }> {
  const byTime = <T extends { created_at: string }>(rows: T[]) =>
    [...rows].sort((left, right) =>
      left.created_at.localeCompare(right.created_at)
    );
  const asked = byTime(events);
  const sortedReplies = byTime(replies);
  const answers: Array<{ questionId: string; answer: string }> = [];
  asked.forEach((event, index) => {
    const [questionId] = questionIdsOf(event.detail);
    const next = asked[index + 1]?.created_at;
    const reply = sortedReplies.find(
      (row) =>
        row.created_at > event.created_at && (!next || row.created_at <= next)
    );
    const answer = reply?.message?.trim().slice(0, 500);
    if (questionId && answer) answers.push({ questionId, answer });
  });
  return answers;
}
