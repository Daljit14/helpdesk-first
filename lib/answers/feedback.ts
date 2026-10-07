import { isKnowledgeLearningEnabled } from "@/lib/admin/flags";
import { enqueueLearningEvent } from "@/lib/knowledge/learning";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type AnswerFeedbackOutcome = "helpful" | "not_helpful" | "fixed";

export async function recordAnswerFeedback(
  admin: Admin,
  input: {
    runId: string;
    organizationId: string | null;
    outcome: AnswerFeedbackOutcome;
    ticketId: string | null;
  }
): Promise<{ ok: boolean; duplicate?: true }> {
  try {
    const { error } = await admin.from("answer_engine_feedback").insert({
      run_id: input.runId,
      organization_id: input.organizationId,
      outcome: input.outcome,
    });
    if (error?.code === "23505") return { ok: true, duplicate: true };
    if (error) return { ok: false };
  } catch {
    return { ok: false };
  }

  if (
    input.outcome === "fixed" &&
    input.organizationId &&
    input.ticketId &&
    isKnowledgeLearningEnabled()
  ) {
    try {
      await enqueueLearningEvent(admin, input.ticketId, input.organizationId);
    } catch {
      return { ok: true };
    }
  }
  return { ok: true };
}
