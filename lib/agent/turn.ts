import { escalate } from "./session";
import { runAgentTurn, type AgentLoopDeps } from "./loop";
import { decideConsent, confirmOutcome } from "./actions";
import type { AgentEvent, AgentSession } from "./types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type AgentTurnDeps = Partial<AgentLoopDeps> & {
  runAgentTurn?: typeof runAgentTurn;
};

export async function handleAgentRequest(input: {
  admin: Admin;
  session: AgentSession;
  message: string;
  consent?: {
    approvalRequestId: string;
    decision: "approve" | "decline";
  };
  confirm?: "yes" | "no";
  humanRequested?: boolean;
  platform?: string;
  emit: (event: AgentEvent) => void;
  signal: AbortSignal;
  deps?: AgentTurnDeps;
}): Promise<void> {
  const { admin, session, message, platform, emit, signal, deps } = input;
  if (input.humanRequested) {
    const ticketId = await (deps?.escalate ?? escalate)(
      admin,
      session,
      "user_requested_human",
      message
    );
    emit({
      type: "escalated",
      ticketId,
      reason: "user_requested_human",
    });
    return;
  }
  if (input.consent) {
    const result = await decideConsent(
      admin,
      session,
      { ...input.consent, userId: session.requester_id },
      emit,
      signal
    );
    if (result === "invalid")
      emit({
        type: "error",
        message: "That consent request is no longer available.",
      });
    return;
  }
  if (input.confirm) {
    const result = await confirmOutcome(admin, session, input.confirm);
    if (result === "resolved")
      emit({
        type: "resolved",
        text: "Your support request has been resolved.",
      });
    else if (result === "rejected_no_verification")
      emit({
        type: "error",
        message: "I can't mark this resolved without a passing check",
      });
    else if (result === "escalated")
      emit({
        type: "escalated",
        ticketId: session.escalation_ticket_id ?? "",
        reason: "max_failed_hypotheses",
      });
    return;
  }

  const injectedRunAgentTurn = deps?.runAgentTurn ?? runAgentTurn;
  const loopDeps = { ...deps };
  delete loopDeps.runAgentTurn;
  await injectedRunAgentTurn({
    admin,
    session,
    platform,
    emit,
    signal,
    userMessage: input.message,
    deps: loopDeps,
  });
}
