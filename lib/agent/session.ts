import { createWorkflowTicket } from "@/app/actions/tickets";
import { attachTicketAttachments } from "@/lib/attachments/server";
import { completeUserHandoff } from "@/lib/tickets/handoff";
import { createClient } from "@/lib/supabase/server";
import {
  decryptAgentText,
  encryptAgentTextForWrite,
} from "@/lib/security/ticket-crypto";
import type { HandoffReason } from "@/lib/tickets/routing";
import type { AgentEvent, AgentSession } from "./types";
import { isAgentUserStepsEnabled } from "@/lib/admin/flags";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { getIssueBySlug } from "@/lib/search";
import { getIssueStepPolicies } from "@/lib/investigation/policy";
import { NO_REQUESTER, toUserText } from "./output-guard";
import {
  provenanceFromTool,
  splitUserTurn,
  type SessionProvenance,
} from "./taint";

type Admin = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

export function handoffReasonFor(
  reason: string,
  terminalStatus: "escalated" | "halted"
): HandoffReason {
  if (reason === "user_requested_human") return "user_requested_human";
  if (
    terminalStatus === "halted" ||
    /security|injection|denylist|identity|tripwire/i.test(reason)
  )
    return "security_concern";
  if (
    [
      "max_failed_hypotheses",
      "rollback_failed",
      "verification_inconclusive",
      "execution_denied",
      "verification_failed",
    ].includes(reason)
  )
    return "repeated_failure";
  if (reason === "low_confidence") return "low_confidence";
  return "agent_halted";
}

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
    capabilityId?: string;
    paramsHash?: string;
    policyDecision?: string;
    consentId?: string;
    attachmentId?: string;
    resultSummary?: string;
  }
): Promise<string | null> {
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
  const result = await admin
    .from("agent_steps")
    .insert({
      session_id: session.id,
      organization_id: session.organization_id,
      seq,
      kind: input.kind,
      tool_name: input.toolName ?? null,
      capability_id: input.capabilityId ?? null,
      params_hash: input.paramsHash ?? null,
      policy_decision: input.policyDecision ?? null,
      consent_id: input.consentId ?? null,
      attachment_id: input.attachmentId ?? null,
      result_summary: encrypted,
    })
    .select("id")
    .single();
  return result.data?.id ?? null;
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

export async function loadSessionEvidence(
  admin: Admin,
  session: AgentSession
): Promise<Array<{ id: string; tool: string }>> {
  if (!admin || typeof admin.from !== "function") return [];
  const result = await admin
    .from("agent_steps")
    .select("tool_name,result_summary")
    .eq("session_id", session.id)
    .eq("kind", "tool_result")
    .order("seq", { ascending: true })
    .limit(50);
  const entries = await Promise.all(
    (result.data ?? []).map(async (step) => {
      const summary = await decryptAgentText(
        admin,
        session.organization_id,
        "agent_steps",
        "result_summary",
        step.result_summary
      );
      const match = String(summary ?? "").match(/\[evidence id: (ev-\d+)\]/);
      return match && step.tool_name
        ? { id: match[1], tool: step.tool_name }
        : null;
    })
  );
  return entries.filter(
    (value): value is { id: string; tool: string } => value !== null
  );
}

export async function loadSessionProvenance(
  admin: Admin,
  session: AgentSession
): Promise<SessionProvenance> {
  if (!admin || typeof admin.from !== "function")
    return { userTexts: [], items: [] };
  const result = await admin
    .from("agent_steps")
    .select("kind,tool_name,result_summary,seq")
    .eq("session_id", session.id)
    .in("kind", ["user_message", "tool_result", "final"])
    .order("seq", { ascending: true })
    .limit(50);
  const provenance: SessionProvenance = { userTexts: [], items: [] };
  for (const step of result.data ?? []) {
    const summary = await decryptAgentText(
      admin,
      session.organization_id,
      "agent_steps",
      "result_summary",
      step.result_summary
    );
    if (typeof summary !== "string" || summary.length === 0) continue;
    if (step.kind === "user_message") {
      const split = splitUserTurn(summary);
      if (split.userText) provenance.userTexts.push(split.userText);
      provenance.items.push(...split.untrusted);
    } else if (step.kind === "tool_result" && step.tool_name) {
      const evidenceId = summary.match(/\[evidence id: (ev-\d+)\]/)?.[1];
      if (evidenceId) {
        provenance.items.push(
          ...provenanceFromTool(
            step.tool_name,
            evidenceId,
            summary.replace(/^\[evidence id: ev-\d+\]\s*/, "")
          )
        );
      }
    } else if (step.kind === "final") {
      provenance.items.push({
        evidenceId: `final-${step.seq ?? provenance.items.length + 1}`,
        source: "earlier reply",
        trust: "external_untrusted",
        text: summary,
      });
    }
  }
  return provenance;
}

export async function hasServiceIncident(
  admin: Admin,
  session: AgentSession
): Promise<boolean> {
  try {
    const result = await admin
      .from("agent_steps")
      .select("id")
      .eq("session_id", session.id)
      .eq("kind", "service_incident")
      .limit(1)
      .maybeSingle();
    return Boolean(result.error || result.data);
  } catch {
    return true;
  }
}

async function escalatedUserStepActions(
  admin: Admin,
  session: AgentSession,
  ticketId: string
): Promise<
  Array<{
    ticket_id: string;
    organization_id: string;
    agent_id: null;
    tool_name: string;
    action_summary: string;
    result_summary: string;
    approval_type: "none";
    consent_required: false;
    consent_received: false;
    created_at: string | null;
  }>
> {
  if (!isAgentUserStepsEnabled()) return [];
  const result = await admin
    .from("agent_steps")
    .select("id,kind,params_hash,result_summary,created_at")
    .eq("organization_id", session.organization_id)
    .eq("session_id", session.id)
    .in("kind", ["user_step_offered", "user_step_outcome", "user_step_saved"])
    .order("seq", { ascending: true });
  const rows = result.data ?? [];
  const outcomes = new Map(
    rows
      .filter((step) => step.kind === "user_step_outcome")
      .map((step) => [step.params_hash, step])
  );
  const saved = new Set(
    rows
      .filter((step) => step.kind === "user_step_saved")
      .map((step) => step.params_hash)
  );
  const actions: Array<{
    ticket_id: string;
    organization_id: string;
    agent_id: null;
    tool_name: string;
    action_summary: string;
    result_summary: string;
    approval_type: "none";
    consent_required: false;
    consent_received: false;
    created_at: string | null;
  }> = [];
  for (const step of rows.filter((item) => item.kind === "user_step_offered")) {
    const match = /^([a-z0-9-]{1,80})#(\d+)$/.exec(step.params_hash ?? "");
    const stepIndex = match ? Number(match[2]) : -1;
    const issue = match ? getIssueBySlug(match[1]) : undefined;
    const instruction =
      issue &&
      Number.isSafeInteger(stepIndex) &&
      stepIndex >= 0 &&
      getIssueStepPolicies(issue)[stepIndex]?.text;
    if (!instruction || !issue) continue;

    const outcomeStep = outcomes.get(step.id);
    const rawOutcome = outcomeStep
      ? await decryptAgentText(
          admin,
          session.organization_id,
          "agent_steps",
          "result_summary",
          outcomeStep.result_summary
        )
      : null;
    const resultSummary =
      rawOutcome === "done"
        ? "Requester did it"
        : rawOutcome === "didnt_work"
          ? "Requester said it didn't work"
          : rawOutcome === "cant_do"
            ? "Requester couldn't do it"
            : "Not done before the session ended";
    const actionSummary = `Your step: ${instruction} — Source: ${issue.title}`;
    actions.push({
      ticket_id: ticketId,
      organization_id: session.organization_id,
      agent_id: null,
      tool_name: "user_step",
      action_summary: actionSummary.slice(0, 1000),
      result_summary: resultSummary,
      approval_type: "none",
      consent_required: false,
      consent_received: false,
      created_at: step.created_at,
    });

    if (!outcomeStep && !saved.has(step.id)) {
      const summary = await decryptAgentText(
        admin,
        session.organization_id,
        "agent_steps",
        "result_summary",
        step.result_summary
      );
      let why = "";
      try {
        const parsed = JSON.parse(summary ?? "") as { why?: unknown };
        if (typeof parsed.why === "string")
          why = toUserText(parsed.why, NO_REQUESTER).slice(0, 200);
      } catch {
        why = "";
      }
      try {
        await enqueueNotification({
          organizationId: session.organization_id,
          ticketId,
          eventType: "agent.user_step_pending",
          recipientUserIds: [session.requester_id],
          subject: "A step to try from your support chat",
          body: `${instruction}\n\n${why}\n\n${issue.title}`,
          url: `/tickets/${ticketId}`,
          dedupeKey: `user-step:${step.id}`,
        });
        await writeStep(admin, session, {
          kind: "user_step_saved",
          paramsHash: step.id,
          resultSummary: "pending",
        });
      } catch (error) {
        console.error("Failed to save pending requester step.", error);
      }
    }
  }
  return actions;
}

export async function loadRequesterIdentifiers(
  admin: Admin,
  session: AgentSession
): Promise<string[]> {
  const identifiers = new Set<string>();
  try {
    const result = await admin.auth.admin.getUserById(session.requester_id);
    const email = result.data.user?.email?.trim().toLowerCase();
    if (!result.error && email) identifiers.add(email);
  } catch {
    // Failed identity lookups leave fewer exemptions and cause more redaction.
  }
  try {
    const devices = await admin
      .from("devices_public")
      .select("hostname")
      .eq("organization_id", session.organization_id)
      .eq("user_id", session.requester_id)
      .eq("status", "active");
    if (!devices.error) {
      for (const row of devices.data ?? []) {
        const hostname =
          typeof row.hostname === "string" ? row.hostname.trim() : "";
        if (hostname) identifiers.add(hostname);
      }
    }
  } catch {
    // Failed device lookups leave fewer exemptions and cause more redaction.
  }
  return [...identifiers];
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
  const created = session.backing_ticket_id
    ? { ticketId: session.backing_ticket_id }
    : await createWorkflowTicket({
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
  const screenshotSteps = await admin
    .from("agent_steps")
    .select("attachment_id")
    .eq("session_id", session.id)
    .eq("kind", "screenshot_received")
    .not("attachment_id", "is", null);
  const screenshotIds = (screenshotSteps.data ?? [])
    .map((step) => step.attachment_id)
    .filter((id): id is string => typeof id === "string");
  if (screenshotIds.length > 0) {
    await attachTicketAttachments(created.ticketId, screenshotIds);
  }
  try {
    const actionSteps = await admin
      .from("agent_steps")
      .select("kind,capability_id,result_summary,created_at")
      .eq("organization_id", session.organization_id)
      .eq("session_id", session.id)
      .in("kind", [
        "action_executing",
        "verification_result",
        "user_feedback",
        "action_autorun",
      ])
      .order("seq", { ascending: true });
    const actions = await Promise.all(
      (actionSteps.data ?? []).map(async (step) => {
        const capability = String(step.capability_id ?? step.kind);
        const summary = String(
          (await decryptAgentText(
            admin,
            session.organization_id,
            "agent_steps",
            "result_summary",
            step.result_summary
          )) ?? ""
        )
          .trim()
          .slice(0, 1000);
        const resultSummary =
          step.kind === "user_feedback"
            ? summary.toLowerCase() === "no"
              ? "Requester reported still broken"
              : summary.toLowerCase() === "yes"
                ? "Requester confirmed fixed"
                : summary
            : summary;
        const actionSummary =
          step.kind === "action_autorun"
            ? `Ran ${capability} automatically (autorun tier)`
            : step.kind === "action_executing"
              ? `Ran ${capability} after requester approval`
              : step.kind === "verification_result"
                ? `Independent verification of ${capability}`
                : `Requester asked "Is it working now?"`;
        return {
          ticket_id: created.ticketId,
          organization_id: session.organization_id,
          agent_id: null,
          tool_name: capability.slice(0, 120),
          action_summary: actionSummary.slice(0, 1000),
          result_summary: resultSummary,
          approval_type:
            step.kind === "action_executing" ? "user_consent" : "none",
          consent_required: step.kind === "action_executing",
          consent_received: step.kind === "action_executing",
          created_at: step.created_at,
        };
      })
    );
    actions.push(
      ...(await escalatedUserStepActions(admin, session, created.ticketId))
    );
    if (actions.length > 0) {
      const inserted = await admin.from("ticket_actions").insert(actions);
      if (inserted.error)
        console.error(
          "Failed to record requester-agent actions.",
          inserted.error
        );
    }
  } catch (error) {
    console.error("Failed to record requester-agent actions.", error);
  }
  const client = await createClient();
  await client.rpc("handoff_ticket", {
    ticket: created.ticketId,
    reason,
    handoff: handoffReasonFor(reason, terminalStatus),
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
    backing_ticket_id: session.backing_ticket_id ?? created.ticketId,
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
