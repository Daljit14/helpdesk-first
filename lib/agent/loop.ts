import { alertSecurityEvent } from "@/lib/autonomy/alerts";
import { checkUserMessageSafety } from "@/lib/ai/safety-policy";
import { guardModelInput } from "@/lib/autonomy/guardrails/input";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import { checkAndConsumeDailyBudget } from "@/lib/ai/budget";
import { AGENT_TOOLS, runTool, toolParamsHash } from "./tools";
import { budgetExceeded } from "./budgets";
import { createAgentModel, type AgentMessage, type AgentModel } from "./model";
import { AGENT_SYSTEM_PROMPT } from "./prompt";
import { detectTripwire } from "./tripwires";
import { isDenylisted } from "./denylist";
import { sanitizeForUser } from "./untrusted";
import {
  escalate,
  halt,
  loadSessionContext,
  updateSession,
  writeStep,
} from "./session";
import type { AgentEvent, AgentSession } from "./types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

function summary(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 140);
}

function safeFinalText(value: string): { text: string; stripped: boolean } {
  const stripped = /\b(fixed|resolved|solved)\b/i.test(value);
  return {
    stripped,
    text: stripped
      ? value.replace(/\b(fixed|resolved|solved)\b/gi, "may have addressed")
      : value,
  };
}

export type AgentLoopDeps = {
  budgetExceeded: typeof budgetExceeded;
  readKillSwitches: typeof readKillSwitches;
  checkDailyBudget: typeof checkAndConsumeDailyBudget;
  runTool: typeof runTool;
  writeStep: typeof writeStep;
  updateSession: typeof updateSession;
  escalate: typeof escalate;
  halt: typeof halt;
  alert: typeof alertSecurityEvent;
  loadContext: typeof loadSessionContext;
};

const defaultDeps: AgentLoopDeps = {
  budgetExceeded,
  readKillSwitches,
  checkDailyBudget: checkAndConsumeDailyBudget,
  runTool,
  writeStep,
  updateSession,
  escalate,
  halt,
  alert: alertSecurityEvent,
  loadContext: loadSessionContext,
};

export async function runAgentTurn(input: {
  admin: Admin;
  session: AgentSession;
  userMessage: string;
  model?: AgentModel;
  platform?: string;
  emit: (event: AgentEvent) => void;
  signal: AbortSignal;
  deps?: Partial<AgentLoopDeps>;
}): Promise<void> {
  const { admin, session, userMessage, emit, signal } = input;
  const deps = { ...defaultDeps, ...input.deps };
  const guarded = guardModelInput([{ source: "event", text: userMessage }]);
  const safety = checkUserMessageSafety({ message: userMessage });
  const tripwire = detectTripwire(userMessage);
  if (guarded.blocked || !safety.allowed || tripwire) {
    const reason =
      tripwire ?? guarded.blockReason ?? safety.category ?? "unsafe_input";
    const ticketId = await deps.halt(admin, session, reason, userMessage, true);
    await deps.alert(admin, {
      organizationId: session.organization_id,
      ticketId,
      runId: null,
      kind: `requester_agent_tripwire:${reason}`,
    });
    emit({ type: "halted", reason, ticketId });
    return;
  }

  await deps.writeStep(admin, session, {
    kind: "user_message",
    resultSummary: userMessage,
  });
  await deps.updateSession(admin, session, { last_user_message: userMessage });

  const model = input.model ?? createAgentModel(userMessage);
  const messages: AgentMessage[] = [
    ...(await deps.loadContext(admin, session)),
    { role: "user", content: userMessage },
  ];
  const toolResults: string[] = [];
  const seen = new Map<string, number>();
  let invalid = 0;
  let modelTurns = session.model_turn_count;
  let toolCalls = session.tool_call_count;
  let identityFailures = 0;

  while (!signal.aborted) {
    const switches = await deps.readKillSwitches(
      admin,
      session.organization_id
    );
    if (switches.global || switches.organization || switches.explicit) {
      const ticketId = await deps.halt(
        admin,
        session,
        "kill_switch",
        userMessage
      );
      emit({ type: "halted", reason: "kill_switch", ticketId });
      return;
    }
    const budget = deps.budgetExceeded(session);
    if (budget) {
      const ticketId = await deps.escalate(
        admin,
        session,
        `budget:${budget}`,
        userMessage
      );
      emit({ type: "escalated", ticketId, reason: `budget:${budget}` });
      return;
    }
    if (!(await deps.checkDailyBudget())) {
      const ticketId = await deps.escalate(
        admin,
        session,
        "budget:daily_ai",
        userMessage
      );
      emit({ type: "escalated", ticketId, reason: "budget:daily_ai" });
      return;
    }
    modelTurns += 1;
    session.model_turn_count = modelTurns;
    await deps.updateSession(admin, session, { model_turn_count: modelTurns });
    const result = await model.next({
      system: AGENT_SYSTEM_PROMPT,
      messages,
      tools: AGENT_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Record<string, unknown>,
      })),
      maxTokens: 1200,
      signal,
    });
    if (result.kind === "invalid") {
      invalid += 1;
      await deps.writeStep(admin, session, {
        kind: "tool_rejected",
        resultSummary: "The model returned invalid output.",
      });
      if (invalid >= 2) {
        const ticketId = await deps.escalate(
          admin,
          session,
          "model_invalid_output",
          userMessage
        );
        emit({ type: "escalated", ticketId, reason: "model_invalid_output" });
        return;
      }
      continue;
    }
    invalid = 0;
    if (result.kind === "final") {
      const confidence = Math.max(0, Math.min(1, result.confidence));
      const finalText = safeFinalText(result.text);
      const text = sanitizeForUser(finalText.text).slice(0, 1200);
      if (finalText.stripped) {
        await deps.writeStep(admin, session, {
          kind: "claim_stripped",
          resultSummary: text,
        });
      }
      if (confidence < 0.8) {
        const ticketId = await deps.escalate(
          admin,
          session,
          "low_confidence",
          userMessage
        );
        emit({ type: "escalated", ticketId, reason: "low_confidence" });
        return;
      }
      await deps.writeStep(admin, session, {
        kind: "final",
        resultSummary: text,
      });
      await deps.updateSession(admin, session, {
        resolution_summary: text,
      });
      emit({
        type: "final_answer",
        text,
        confidence,
        evidence: toolResults.slice(0, 5),
      });
      return;
    }
    if (isDenylisted(result.name)) {
      const ticketId = await deps.halt(
        admin,
        session,
        "model_proposed_denylisted",
        userMessage,
        true
      );
      await deps.alert(admin, {
        organizationId: session.organization_id,
        ticketId,
        runId: null,
        kind: "requester_agent_tripwire:model_proposed_denylisted",
      });
      emit({
        type: "halted",
        ticketId,
        reason: "model_proposed_denylisted",
      });
      return;
    }
    const key = `${result.name}:${toolParamsHash(result.name, result.input)}`;
    const repeats = (seen.get(key) ?? 0) + 1;
    seen.set(key, repeats);
    if (repeats >= 3) {
      const ticketId = await deps.escalate(
        admin,
        session,
        "loop_detected",
        userMessage
      );
      emit({ type: "escalated", ticketId, reason: "loop_detected" });
      return;
    }
    const thinking = summary(result.summary);
    await deps.writeStep(admin, session, {
      kind: "thinking_summary",
      resultSummary: thinking,
    });
    emit({ type: "thinking_summary", text: thinking });
    emit({ type: "tool_started", tool: result.name });
    await deps.writeStep(admin, session, {
      kind: "tool_started",
      toolName: result.name,
      paramsHash: toolParamsHash(result.name, result.input),
      resultSummary: summary(result.summary),
    });
    const tool =
      repeats === 2
        ? {
            ok: true as const,
            value: null,
            modelText: "Already retrieved this read-only result.",
            userSummary: "Already retrieved this read-only result.",
          }
        : await deps.runTool(
            {
              admin,
              session,
              requesterId: session.requester_id,
              organizationId: session.organization_id,
              platform: input.platform,
              signal,
              emit,
            },
            result.name,
            result.input
          );
    const toolSummary = tool.userSummary;
    await deps.writeStep(admin, session, {
      kind: tool.ok ? "tool_result" : "tool_rejected",
      toolName: result.name,
      paramsHash: toolParamsHash(result.name, result.input),
      resultSummary: toolSummary,
    });
    toolCalls += 1;
    session.tool_call_count = toolCalls;
    await deps.updateSession(admin, session, { tool_call_count: toolCalls });
    emit({
      type: "tool_result_summary",
      tool: result.name,
      summary: toolSummary,
    });
    if (!tool.ok && tool.code === "injection_in_tool_output") {
      const ticketId = await deps.halt(
        admin,
        session,
        tool.code,
        userMessage,
        true
      );
      await deps.alert(admin, {
        organizationId: session.organization_id,
        ticketId,
        runId: null,
        kind: "requester_agent_tripwire:injection_in_tool_output",
      });
      emit({ type: "halted", reason: tool.code, ticketId });
      return;
    }
    if (!tool.ok && tool.code === "kill_switch") {
      const ticketId = await deps.halt(admin, session, tool.code, userMessage);
      emit({ type: "halted", reason: tool.code, ticketId });
      return;
    }
    if (!tool.ok && tool.code === "identity_denied") {
      identityFailures += 1;
      if (identityFailures >= 2) {
        const ticketId = await deps.halt(
          admin,
          session,
          "repeated_identity_failure",
          userMessage,
          true
        );
        await deps.alert(admin, {
          organizationId: session.organization_id,
          ticketId,
          runId: null,
          kind: "requester_agent_tripwire:repeated_identity_failure",
        });
        emit({
          type: "halted",
          ticketId,
          reason: "repeated_identity_failure",
        });
        return;
      }
    } else if (tool.ok) {
      identityFailures = 0;
    }
    toolResults.push(toolSummary);
    messages.push(
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: result.id,
            name: result.name,
            input: result.input,
          },
        ],
      },
      {
        role: "tool_result",
        tool_use_id: result.id,
        content: tool.modelText,
      }
    );
  }
}
