import { escalate } from "./session";
import { runAgentTurn, type AgentLoopDeps } from "./loop";
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
