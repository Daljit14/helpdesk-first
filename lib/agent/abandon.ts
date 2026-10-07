import { encryptAgentTextForWrite } from "@/lib/security/ticket-crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { writeStep } from "./session";
import type { AgentSession } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

type AbandonSession = Pick<
  AgentSession,
  "id" | "organization_id" | "started_at" | "updated_at"
>;

type Step = {
  kind: string;
  created_at: string;
  seq: number;
};

export async function sweepAbandonedSessions(
  admin: Admin,
  input: { now: Date; minutes: number; limit?: number }
): Promise<{ scanned: number; abandoned: number; skipped: number }> {
  const cutoff = new Date(
    input.now.getTime() - input.minutes * 60_000
  ).toISOString();
  const sessionsResult = await admin
    .from("agent_sessions")
    .select("id,organization_id,started_at,updated_at")
    .eq("status", "active")
    .is("pending_approval_id", null)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(input.limit ?? 500);
  if (sessionsResult.error) throw sessionsResult.error;

  const sessions = (sessionsResult.data ?? []) as AbandonSession[];
  let abandoned = 0;
  let skipped = 0;

  for (const session of sessions) {
    const stepsResult = await admin
      .from("agent_steps")
      .select("kind,created_at,seq")
      .eq("session_id", session.id)
      .order("seq", { ascending: true });
    if (stepsResult.error) throw stepsResult.error;
    const steps = (stepsResult.data ?? []) as Step[];
    const orderedSteps = [...steps].sort((left, right) => left.seq - right.seq);
    const userMessages = orderedSteps.filter(
      (step) => step.kind === "user_message"
    );
    const lastUserMessage = userMessages[userMessages.length - 1];
    const lastUserTurnAt = Date.parse(
      lastUserMessage?.created_at ?? session.started_at
    );

    const unresolvedAction = orderedSteps.some(
      (step) =>
        (step.kind === "action_executing" || step.kind === "action_autorun") &&
        !orderedSteps.some(
          (later) =>
            later.seq > step.seq &&
            (later.kind === "verification_result" ||
              later.kind === "rollback_result")
        )
    );
    const consentRequests = orderedSteps.filter(
      (step) =>
        step.kind === "consent_required" || step.kind === "step_up_required"
    );
    const latestConsentRequest = consentRequests[consentRequests.length - 1];
    const unresolvedConsent =
      latestConsentRequest !== undefined &&
      !orderedSteps.some(
        (step) =>
          step.seq > latestConsentRequest.seq &&
          (step.kind === "consent_decided" || step.kind === "consent_declined")
      );

    if (
      !Number.isFinite(lastUserTurnAt) ||
      lastUserTurnAt > Date.parse(cutoff) ||
      unresolvedAction ||
      unresolvedConsent
    ) {
      skipped += 1;
      continue;
    }

    const resolutionSummary = await encryptAgentTextForWrite(
      admin,
      session.organization_id,
      "agent_sessions",
      "resolution_summary",
      "abandoned_no_user_turn"
    );
    const updateResult = await admin
      .from("agent_sessions")
      .update({
        status: "abandoned",
        ended_at: input.now.toISOString(),
        updated_at: input.now.toISOString(),
        resolution_summary: resolutionSummary,
      })
      .eq("id", session.id)
      .eq("status", "active")
      .eq("updated_at", session.updated_at)
      .select("id");
    if (updateResult.error) throw updateResult.error;

    const updatedRows = Array.isArray(updateResult.data)
      ? updateResult.data
      : updateResult.data
        ? [updateResult.data]
        : [];
    if (updatedRows.length === 0) {
      skipped += 1;
      continue;
    }

    await writeStep(admin, session as AgentSession, {
      kind: "abandoned",
      resultSummary: `No user turn for ${input.minutes} minutes.`,
    });
    abandoned += 1;
  }

  return { scanned: sessions.length, abandoned, skipped };
}
