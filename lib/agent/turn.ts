import { escalate } from "./session";
import { runAgentTurn, type AgentLoopDeps } from "./loop";
import {
  decideConsent as defaultDecideConsent,
  confirmOutcome as defaultConfirmOutcome,
} from "./actions";
import type { AgentEvent, AgentSession } from "./types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type AgentTurnDeps = Partial<AgentLoopDeps> & {
  runAgentTurn?: typeof runAgentTurn;
  decideConsent?: typeof defaultDecideConsent;
  confirmOutcome?: typeof defaultConfirmOutcome;
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
    let capabilityId = "the requested action";
    const dispatchEmit = (event: AgentEvent) => {
      if (
        event.type === "consent_declined" ||
        event.type === "action_executing"
      )
        capabilityId = event.capabilityId;
      emit(event);
    };
    const result = await (deps?.decideConsent ?? defaultDecideConsent)(
      admin,
      session,
      { ...input.consent, userId: session.requester_id },
      dispatchEmit,
      signal
    );
    if (result === "invalid")
      emit({
        type: "error",
        message: "That consent request is no longer available.",
      });
    else if (result === "declined" || result === "executed_verified_failed") {
      const injectedRunAgentTurn = deps?.runAgentTurn ?? runAgentTurn;
      const loopDeps = { ...deps };
      delete loopDeps.runAgentTurn;
      await injectedRunAgentTurn({
        admin,
        session,
        platform,
        emit,
        signal,
        userMessage:
          result === "declined"
            ? `User declined \`${capabilityId}\``
            : `The fix \`${capabilityId}\` was rolled back after verification failed`,
        deps: loopDeps,
      });
    }
    return;
  }
  if (input.confirm) {
    const result = await (deps?.confirmOutcome ?? defaultConfirmOutcome)(
      admin,
      session,
      input.confirm
    );
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
    else if (result === "next_hypothesis") {
      const injectedRunAgentTurn = deps?.runAgentTurn ?? runAgentTurn;
      const loopDeps = { ...deps };
      delete loopDeps.runAgentTurn;
      let capabilityId = "the attempted fix";
      if (typeof admin.from === "function") {
        const latest = await admin
          .from("agent_steps")
          .select("capability_id")
          .eq("session_id", session.id)
          .not("capability_id", "is", null)
          .order("seq", { ascending: false })
          .limit(1)
          .maybeSingle();
        capabilityId = latest.data?.capability_id ?? capabilityId;
      }
      await injectedRunAgentTurn({
        admin,
        session,
        platform,
        emit,
        signal,
        userMessage: `Still broken after \`${capabilityId}\``,
        deps: loopDeps,
      });
    }
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
