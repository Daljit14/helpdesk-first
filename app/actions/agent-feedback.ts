"use server";

import { z } from "zod";
import { isOutcomeFeedbackEnabled } from "@/lib/admin/flags";
import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";
import { redactForLearning } from "@/lib/knowledge/learning-redaction";
import { encryptAgentTextForWrite } from "@/lib/security/ticket-crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";

export type OutcomeFeedbackVerdict =
  "still_broken" | "came_back" | "wrong_problem" | "other";

const outcomeFeedbackSchema = z.object({
  sessionId: z.string().uuid(),
  verdict: z.enum(["still_broken", "came_back", "wrong_problem", "other"]),
  text: z.string().max(2000).optional(),
});

const outcomeFeedbackLimiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 10 },
  "outcome-feedback"
);
const ELIGIBILITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function getErrorCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error
    ? error.code
    : undefined;
}

export async function submitAgentOutcomeFeedback(input: {
  sessionId: string;
  verdict: OutcomeFeedbackVerdict;
  text?: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      error:
        | "disabled"
        | "unauthenticated"
        | "invalid"
        | "rate_limited"
        | "not_found"
        | "not_eligible"
        | "already_submitted"
        | "failed";
    }
> {
  if (!isOutcomeFeedbackEnabled()) return { ok: false, error: "disabled" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const parsed = outcomeFeedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  let rate;
  try {
    rate = await outcomeFeedbackLimiter.check(user.id);
  } catch {
    return { ok: false, error: "failed" };
  }
  if (!rate.allowed) return { ok: false, error: "rate_limited" };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "failed" };
  }

  let sessionResult;
  try {
    sessionResult = await admin
      .from("agent_sessions")
      .select("id,organization_id,requester_id,status,ended_at")
      .eq("id", parsed.data.sessionId)
      .eq("requester_id", user.id)
      .maybeSingle();
  } catch {
    return { ok: false, error: "failed" };
  }
  if (sessionResult.error) return { ok: false, error: "failed" };
  const session = sessionResult.data;
  if (!session) return { ok: false, error: "not_found" };

  const endedAt = session.ended_at ? Date.parse(session.ended_at) : NaN;
  const now = Date.now();
  if (
    session.status !== "resolved" ||
    !Number.isFinite(endedAt) ||
    endedAt < now - ELIGIBILITY_WINDOW_MS ||
    endedAt > now
  ) {
    return { ok: false, error: "not_eligible" };
  }

  const text = parsed.data.text?.trim() ?? "";
  const redacted = text
    ? redactForLearning(text, 1000)
    : { text: "", summary: {} };
  let freeText: string | null = null;
  if (text) {
    try {
      freeText = await encryptAgentTextForWrite(
        admin,
        session.organization_id,
        "agent_outcome_feedback",
        "free_text",
        redacted.text
      );
    } catch {
      return { ok: false, error: "failed" };
    }
  }

  let insertResult;
  try {
    insertResult = await admin.from("agent_outcome_feedback").insert({
      session_id: session.id,
      organization_id: session.organization_id,
      user_id: user.id,
      verdict: parsed.data.verdict,
      free_text: freeText,
      redaction_summary: redacted.summary,
    });
  } catch (error) {
    console.error("outcome_feedback_insert_failed", {
      code: getErrorCode(error),
    });
    return { ok: false, error: "failed" };
  }
  if (insertResult.error?.code === "23505")
    return { ok: false, error: "already_submitted" };
  if (insertResult.error) {
    console.error("outcome_feedback_insert_failed", {
      code: insertResult.error.code,
    });
    return { ok: false, error: "failed" };
  }
  return { ok: true };
}
