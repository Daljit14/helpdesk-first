import { createWorkflowTicket } from "@/app/actions/tickets";
import { completeUserHandoff } from "@/lib/tickets/handoff";
import { createClient } from "@/lib/supabase/server";
import {
  decryptAgentText,
  encryptAgentTextForWrite,
} from "@/lib/security/ticket-crypto";
import type { AgentEvent, AgentSession } from "./types";

type Admin = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

export async function createSession(
  admin: Admin,
  organizationId: string,
  requesterId: string
): Promise<AgentSession> {
  const result = await admin
    .from("agent_sessions")
    .insert({ organization_id: organizationId, requester_id: requesterId })
    .select("*")
    .single();
  if (result.error || !result.data)
    throw new Error("agent_session_create_failed");
  return result.data as AgentSession;
}

export async function loadActiveSession(
  admin: Admin,
  sessionId: string,
  requesterId: string
): Promise<AgentSession | null> {
  const result = await admin
    .from("agent_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("requester_id", requesterId)
    .eq("status", "active")
    .maybeSingle();
  if (!result.data) return null;
  const session = result.data as AgentSession;
  session.last_user_message = await decryptAgentText(
    admin,
    session.organization_id,
    "agent_sessions",
    "last_user_message",
    session.last_user_message
  );
  session.resolution_summary = await decryptAgentText(
    admin,
    session.organization_id,
    "agent_sessions",
    "resolution_summary",
    session.resolution_summary
  );
  return session;
}

export async function writeStep(
  admin: Admin,
  session: AgentSession,
  input: {
    kind: string;
    toolName?: string;
    paramsHash?: string;
    resultSummary?: string;
  }
): Promise<void> {
  const current = await admin
    .from("agent_steps")
    .select("seq")
    .eq("session_id", session.id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const seq = (Number(current.data?.seq) || 0) + 1;
  const encrypted = input.resultSummary
    ? await encryptAgentTextForWrite(
        admin,
        session.organization_id,
        "agent_steps",
        "result_summary",
        input.resultSummary.slice(0, 500)
      )
    : null;
  await admin.from("agent_steps").insert({
    session_id: session.id,
    organization_id: session.organization_id,
    seq,
    kind: input.kind,
    tool_name: input.toolName ?? null,
    params_hash: input.paramsHash ?? null,
    result_summary: encrypted,
  });
}

export async function updateSession(
  admin: Admin,
  session: AgentSession,
  values: Record<string, unknown>
): Promise<void> {
  const next = { ...values };
  for (const column of ["last_user_message", "resolution_summary"] as const) {
    const value = next[column];
    if (typeof value === "string") {
      next[column] = await encryptAgentTextForWrite(
        admin,
        session.organization_id,
        "agent_sessions",
        column,
        value.slice(0, 2000)
      );
    }
  }
  await admin
    .from("agent_sessions")
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "active");
}

export async function loadSessionContext(
  admin: Admin,
  session: AgentSession
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const result = await admin
    .from("agent_steps")
    .select("kind,result_summary,seq")
    .eq("session_id", session.id)
    .in("kind", ["user_message", "final"])
    .order("seq", { ascending: true })
    .limit(20);
  const steps = (result.data ?? []).slice(-10);
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const step of steps) {
    const content = await decryptAgentText(
      admin,
      session.organization_id,
      "agent_steps",
      "result_summary",
      step.result_summary
    );
    if (!content) continue;
    messages.push({
      role: step.kind === "user_message" ? "user" : "assistant",
      content,
    });
  }
  return messages;
}

export async function escalate(
  admin: Admin,
  session: AgentSession,
  reason: string,
  lastMessage: string,
  terminalStatus: "escalated" | "halted" = "escalated",
  terminalFields: Record<string, unknown> = {}
): Promise<string> {
  const steps = await admin
    .from("agent_steps")
    .select("kind,tool_name")
    .eq("organization_id", session.organization_id)
    .eq("session_id", session.id)
    .order("seq", { ascending: true })
    .limit(20);
  const transcript = (steps.data ?? [])
    .map((step) => `${step.kind}${step.tool_name ? `:${step.tool_name}` : ""}`)
    .join(", ");
  const created = await createWorkflowTicket({
    message:
      `Escalated from AI assistant session ${session.id}: ${reason}\n\n${lastMessage}\n\nRead-only steps: ${transcript}`.slice(
        0,
        2000
      ),
    platform: "Other",
    diagnosticAnswers: [],
  });
  if (!("ticketId" in created) || !created.ticketId)
    throw new Error("agent_escalation_ticket_failed");
  const client = await createClient();
  await client.rpc("handoff_ticket", {
    ticket: created.ticketId,
    reason,
    handoff: "user_requested_human",
  });
  await completeUserHandoff(created.ticketId);
  await writeStep(admin, session, {
    kind: terminalStatus === "halted" ? "halted" : "escalated",
    resultSummary: reason,
  });
  await updateSession(admin, session, {
    status: terminalStatus,
    ended_at: new Date().toISOString(),
    escalation_ticket_id: created.ticketId,
    resolution_summary: reason,
    ...terminalFields,
  });
  return created.ticketId;
}

export async function halt(
  admin: Admin,
  session: AgentSession,
  reason: string,
  lastMessage: string,
  securityFlag = false
): Promise<string> {
  const ticketId = await escalate(
    admin,
    session,
    reason,
    lastMessage,
    "halted",
    { halt_reason: reason, security_flag: securityFlag }
  );
  return ticketId;
}

export type SessionEmitter = (event: AgentEvent) => void;
