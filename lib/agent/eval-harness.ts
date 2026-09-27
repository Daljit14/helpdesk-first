import type { AgentModel, AgentModelOutput } from "./model";
import { runAgentTurn, type AgentLoopDeps } from "./loop";
import { handleAgentRequest, type AgentTurnDeps } from "./turn";
import { budgetExceeded } from "./budgets";
import type { AgentEvent, AgentSession } from "./types";
import type { AgentToolResult } from "./tools";
import type { ProposeOutcome } from "./actions";

type HarnessAdmin = Record<string, never>;

export class ScriptedAgentModel implements AgentModel {
  calls = 0;
  requests: Array<{ messages: unknown[] }> = [];

  constructor(private readonly outputs: AgentModelOutput[]) {}

  async next(input: { messages: unknown[] }): Promise<AgentModelOutput> {
    this.calls += 1;
    this.requests.push({ messages: input.messages });
    return this.outputs.shift() ?? { kind: "invalid", raw: "script exhausted" };
  }
}

export type ScriptedToolResult = AgentToolResult & {
  sideEffects?: boolean;
};

export type AgentEvalHarness = {
  session: AgentSession;
  model: ScriptedAgentModel;
  events: AgentEvent[];
  steps: Array<{ kind: string; resultSummary?: string; toolName?: string }>;
  toolCalls: number;
  sideEffectCalls: number;
  executedInputs: unknown[];
  executedTools: string[];
  alerts: number;
  executePlanCalls: number;
  gatewayCalls: number;
  resolvedWithoutVerification: boolean;
  run: () => Promise<void>;
};

function session(): AgentSession {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    organization_id: "00000000-0000-4000-8000-000000000002",
    requester_id: "00000000-0000-4000-8000-000000000003",
    status: "active",
    started_at: new Date().toISOString(),
    ended_at: null,
    last_user_message: null,
    resolution_summary: null,
    escalation_ticket_id: null,
    action_count: 0,
    tool_call_count: 0,
    model_turn_count: 0,
    token_count: 0,
    halt_reason: null,
    security_flag: false,
    updated_at: new Date().toISOString(),
  };
}

export function createAgentEvalHarness(input: {
  outputs: AgentModelOutput[];
  toolResults?: ScriptedToolResult[];
  killSwitchAfterTool?: boolean;
  maxToolCalls?: number;
  message?: string;
  humanRequested?: boolean;
  context?: Array<{ role: "user" | "assistant"; content: string }>;
  consent?: { approvalRequestId: string; decision: "approve" | "decline" };
  confirm?: "yes" | "no";
  proposeActionOutcome?: ProposeOutcome;
  decideConsentResult?: Awaited<
    ReturnType<typeof import("./actions").decideConsent>
  >;
  confirmOutcomeResult?: Awaited<
    ReturnType<typeof import("./actions").confirmOutcome>
  >;
}): AgentEvalHarness {
  const current = session();
  const events: AgentEvent[] = [];
  const steps: AgentEvalHarness["steps"] = [];
  const model = new ScriptedAgentModel([...input.outputs]);
  const toolResults = [...(input.toolResults ?? [])];
  let toolCalls = 0;
  let sideEffectCalls = 0;
  const executedInputs: unknown[] = [];
  const executedTools: string[] = [];
  let alerts = 0;
  let executePlanCalls = 0;
  let gatewayCalls = 0;
  let resolvedWithoutVerification = false;
  const admin = {} as HarnessAdmin;
  const ticketId = "00000000-0000-4000-8000-000000000004";
  const writeStep: NonNullable<AgentLoopDeps["writeStep"]> = async (
    _admin,
    _session,
    step
  ) => {
    steps.push(step);
  };
  const updateSession: NonNullable<AgentLoopDeps["updateSession"]> = async (
    _admin,
    target,
    values
  ) => {
    Object.assign(target, values);
  };
  const terminal = async (
    target: AgentSession,
    status: "escalated" | "halted",
    reason: string,
    security = false
  ) => {
    target.status = status;
    target.escalation_ticket_id = ticketId;
    target.resolution_summary = reason;
    target.halt_reason = status === "halted" ? reason : target.halt_reason;
    target.security_flag = security;
  };
  const deps: AgentTurnDeps = {
    budgetExceeded: (target) =>
      input.maxToolCalls !== undefined &&
      target.tool_call_count >= input.maxToolCalls
        ? "tool_calls"
        : budgetExceeded(target),
    readKillSwitches: async () => ({
      global: Boolean(input.killSwitchAfterTool && toolCalls > 0),
      organization: false,
      capability: false,
      provider: false,
      anyActive: Boolean(input.killSwitchAfterTool && toolCalls > 0),
      envDisabled: false,
      explicit: false,
      reasons: [],
    }),
    checkDailyBudget: async () => true,
    loadContext: async () => input.context ?? [],
    writeStep,
    updateSession,
    runTool: async (_context, name, input) => {
      toolCalls += 1;
      const scripted = toolResults.shift() ?? {
        ok: true as const,
        value: { result: "scripted" },
        modelText:
          '<untrusted_data source="scripted">{"result":"scripted"}</untrusted_data>',
        userSummary: "Scripted read-only result.",
      };
      if (scripted.ok) {
        executedInputs.push(input);
        executedTools.push(name);
        if (scripted.sideEffects) sideEffectCalls += 1;
      }
      return scripted;
    },
    escalate: async (_admin, target, reason) => {
      await terminal(target, "escalated", reason);
      return ticketId;
    },
    halt: async (_admin, target, reason, _message, securityFlag) => {
      await terminal(target, "halted", reason, securityFlag);
      return ticketId;
    },
    alert: async () => {
      alerts += 1;
    },
    proposeAction: async () => {
      if (input.proposeActionOutcome?.kind === "consent_required")
        executePlanCalls += 1;
      return (
        input.proposeActionOutcome ?? {
          kind: "escalate",
          reason: "scripted_proposal",
        }
      );
    },
    decideConsent: async (_admin, target, consent, emit) => {
      if (consent.decision === "approve") gatewayCalls += 1;
      const result = input.decideConsentResult ?? "invalid";
      if (result === "declined")
        emit({ type: "consent_declined", capabilityId: "device_flush_dns" });
      if (result === "executed_verified_failed") {
        emit({
          type: "action_executing",
          capabilityId: "device_flush_dns",
          text: "Applying the fix.",
        });
        emit({
          type: "verification_result",
          status: "failed",
          rollback: "succeeded",
          text: "The fix was rolled back.",
        });
      }
      if (result === "executed_verified_passed")
        target.verified_execution_id = "00000000-0000-4000-8000-000000000005";
      return result;
    },
    confirmOutcome: async (_admin, target, answer) => {
      const result = input.confirmOutcomeResult ?? "rejected_no_verification";
      if (answer === "yes" && result === "resolved") {
        resolvedWithoutVerification = !target.verified_execution_id;
      }
      return result;
    },
  };
  return {
    session: current,
    model,
    events,
    steps,
    get toolCalls() {
      return toolCalls;
    },
    get sideEffectCalls() {
      return sideEffectCalls;
    },
    executedInputs,
    executedTools,
    get alerts() {
      return alerts;
    },
    get executePlanCalls() {
      return executePlanCalls;
    },
    get gatewayCalls() {
      return gatewayCalls;
    },
    get resolvedWithoutVerification() {
      return resolvedWithoutVerification;
    },
    run: () =>
      handleAgentRequest({
        admin: admin as never,
        session: current,
        message: input.message ?? "Wi-Fi keeps dropping",
        humanRequested: input.humanRequested,
        consent: input.consent,
        confirm: input.confirm,
        emit: (event) => events.push(event),
        signal: new AbortController().signal,
        deps: {
          ...deps,
          runAgentTurn: async (turnInput) =>
            runAgentTurn({ ...turnInput, model }),
        },
      }),
  };
}
