import type { AgentModel, AgentModelOutput } from "./model";
import { runAgentTurn, type AgentLoopDeps } from "./loop";
import { handleAgentRequest, type AgentTurnDeps } from "./turn";
import { budgetExceeded } from "./budgets";
import type { AgentEvent, AgentSession } from "./types";
import { runSearchWebTool, type AgentToolResult } from "./tools";
import {
  researchOnlyEvidenceRejection,
  type ProposeActionInput,
  type ProposeOutcome,
} from "./actions";
import { recordAutonomyOutcome } from "@/lib/autonomy/ladder";
import { guardModelInput } from "@/lib/autonomy/guardrails/input";
import { wrapUntrusted } from "./untrusted";
import { NO_REQUESTER, toUserText } from "./output-guard";
import { checkUserStep } from "./user-steps";
import { selectAgentRoute } from "./routing";
import { FakeResearchProvider } from "@/lib/research/fake";
import { heuristicJudge } from "@/lib/research/judge";
import type { ResearchProvider, ResearchSource } from "@/lib/research/types";
import { createEvalResearchStore } from "./eval-research-store";
import {
  findTaintedParams,
  applyDeviceSignedTrust,
  reconfirmSatisfied,
  taintDecision,
  type SessionProvenance,
} from "./taint";
import {
  getCapability,
  inputSchemaJson,
} from "@/lib/autonomy/capabilities/registry";

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
  modelIds: string[];
  providerQueries: string[];
  researchRows: ReturnType<typeof createEvalResearchStore>["rows"];
  events: AgentEvent[];
  steps: Array<{ kind: string; resultSummary?: string; toolName?: string }>;
  toolCalls: number;
  proposeActionCalls: number;
  sideEffectCalls: number;
  executedInputs: unknown[];
  executedTools: string[];
  alerts: number;
  executePlanCalls: number;
  gatewayCalls: number;
  resolvedWithoutVerification: boolean;
  autorunWithoutAdminPromotion: boolean;
  autoDemotionFailed: boolean;
  autorunWithoutSessionConsent: boolean;
  denylistedAutorun: boolean;
  taintedProposal: boolean;
  deviceSignedProposal: boolean;
  taintPolicy: string | null;
  executedWithoutReconfirm: boolean;
  proposalProvenance: SessionProvenance | null;
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
  modelRoute?: "default" | "planner";
  webSearch?: {
    sources: ResearchSource[];
    requesterNameTerms?: string[];
    vendorDomains?: string[];
  };
  realEvidenceCheck?: boolean;
  toolResults?: ScriptedToolResult[];
  serviceIncidentActive?: boolean;
  serviceHealthEnabled?: boolean;
  orgEnvironmentEnabled?: boolean;
  diagnosticSourcesEnabled?: boolean;
  answerEngineEnabled?: boolean;
  userStepsEnabled?: boolean;
  approvedSlugs?: string[];
  killSwitchAfterTool?: boolean;
  maxToolCalls?: number;
  message?: string;
  humanRequested?: boolean;
  context?: Array<{ role: "user" | "assistant"; content: string }>;
  consent?: {
    approvalRequestId: string;
    decision: "approve" | "decline";
    reconfirmTainted?: boolean;
  };
  confirm?: "yes" | "no";
  attachmentIds?: string[];
  requesterIdentifiers?: string[];
  screenshotText?: string;
  screenshotStatus?: "rejected" | "scanning" | "foreign";
  visionEnabled?: boolean;
  proposeActionOutcome?: ProposeOutcome;
  decideConsentResult?: Awaited<
    ReturnType<typeof import("./actions").decideConsent>
  >;
  confirmOutcomeResult?: Awaited<
    ReturnType<typeof import("./actions").confirmOutcome>
  >;
  autonomyScenario?: {
    tier: "consent" | "autorun";
    sessionConsent: boolean;
    denylisted?: boolean;
    rollbackFailed?: boolean;
  };
  taintScenario?: {
    capabilityId: string;
    autorunEligible: boolean;
    reconfirmTainted?: boolean;
    deviceSignedTrust?: {
      enabled: boolean;
      identifiers: string[];
    };
  };
  priorProvenance?: SessionProvenance;
}): AgentEvalHarness {
  const current = session();
  const events: AgentEvent[] = [];
  const steps: AgentEvalHarness["steps"] = [];
  const model = new ScriptedAgentModel([...input.outputs]);
  const modelIds: string[] = [];
  const providerQueries: string[] = [];
  const researchStore = createEvalResearchStore();
  const fakeResearchProvider = new FakeResearchProvider(
    input.webSearch?.sources ?? []
  );
  const researchProvider: ResearchProvider = {
    id: fakeResearchProvider.id,
    search: async (query) => {
      providerQueries.push(query);
      return fakeResearchProvider.search();
    },
  };
  const routeDeps: Partial<AgentLoopDeps> =
    input.modelRoute === undefined
      ? {}
      : {
          createModel: (_message, id) => {
            if (id !== undefined) modelIds.push(id);
            return model;
          },
          selectRoute: (signals) =>
            input.modelRoute === "planner"
              ? selectAgentRoute(
                  { ...signals, failedVerification: true },
                  {
                    enabled: true,
                    plannerModel: "mock-planner",
                    defaultModel: "mock-default",
                  }
                )
              : selectAgentRoute(signals, {
                  enabled: false,
                  plannerModel: "mock-planner",
                  defaultModel: "mock-default",
                }),
        };
  const toolResults = [...(input.toolResults ?? [])];
  let toolCalls = 0;
  let proposeActionCalls = 0;
  let sideEffectCalls = 0;
  const executedInputs: unknown[] = [];
  const executedTools: string[] = [];
  let alerts = 0;
  let executePlanCalls = 0;
  let gatewayCalls = 0;
  let resolvedWithoutVerification = false;
  let taintedProposal = false;
  let deviceSignedProposal = false;
  let taintPolicy: string | null = null;
  let executedWithoutReconfirm = false;
  let proposalProvenance: SessionProvenance | null = null;
  const taintScenario = input.taintScenario;
  const admin = (input.webSearch
    ? researchStore.admin
    : {}) as unknown as HarnessAdmin;
  const autonomyScenario = input.autonomyScenario;
  const autonomyStats: Record<string, unknown> = {
    organization_id: current.organization_id,
    capability_id: "device_flush_dns",
    tier: "autorun",
    live_runs: 0,
    verified_successes: 0,
    verify_failures: 0,
    rollback_failures: 0,
    security_incidents: 0,
    last_promoted_at: null,
    last_demoted_at: null,
    demote_reason: null,
  };
  const autonomyOutcomes: Record<string, unknown>[] = [];
  const autonomyTransitions: Record<string, unknown>[] = [];
  const autonomyAdmin = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        update: () => query,
        get data() {
          if (table === "capability_autonomy_stats") return autonomyStats;
          if (table === "capability_autonomy_outcomes") return autonomyOutcomes;
          if (table === "capability_autonomy_transitions")
            return autonomyTransitions;
          return [];
        },
        get error() {
          return null;
        },
        maybeSingle: async () => ({
          data:
            table === "capability_autonomy_stats"
              ? autonomyStats
              : table === "capability_breakers"
                ? null
                : null,
          error: null,
        }),
        insert: async (value: Record<string, unknown>) => {
          if (table === "capability_autonomy_outcomes")
            autonomyOutcomes.push(value);
          if (table === "capability_autonomy_transitions")
            autonomyTransitions.push(value);
          return { data: value, error: null };
        },
        upsert: async (value: Record<string, unknown>) => {
          Object.assign(autonomyStats, value);
          return { data: value, error: null };
        },
      };
      return query;
    },
  };
  const ticketId = "00000000-0000-4000-8000-000000000004";
  const writeStep: NonNullable<AgentLoopDeps["writeStep"]> = async (
    _admin,
    _session,
    step
  ) => {
    steps.push(step);
    if (step.kind === "user_step_offered")
      return "00000000-0000-4000-8000-000000000005";
    return null;
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
    loadProvenance: async () =>
      input.priorProvenance ?? { userTexts: [], items: [] },
    hasServiceIncident: async () => Boolean(input.serviceIncidentActive),
    serviceHealthEnabled: input.serviceHealthEnabled,
    orgEnvironmentEnabled: input.orgEnvironmentEnabled,
    diagnosticSourcesEnabled: input.diagnosticSourcesEnabled,
    answerEngineEnabled: input.answerEngineEnabled,
    webSearchEnabled: Boolean(input.webSearch),
    loadEvidence: async () => [],
    ...routeDeps,
    userStepsEnabled: input.userStepsEnabled ?? false,
    checkUserStep: (stepInput) =>
      checkUserStep(stepInput, {
        approvedSlugs: new Set(input.approvedSlugs ?? []),
        approvedSoftware: [],
        loadResearchSource: async (id) => {
          const source = researchStore.rows.research_sources.find(
            (row) =>
              row.id === id &&
              row.organization_id === current.organization_id &&
              row.agent_session_id === current.id
          );
          if (!source) return null;
          return {
            trust: String(source.trust ?? ""),
            domain: String(source.domain ?? ""),
            title: String(source.title ?? ""),
            url: String(source.url ?? ""),
          };
        },
      }),
    loadRequesterIdentifiers: async () =>
      input.requesterIdentifiers ?? ["requester@example.test"],
    writeStep,
    updateSession,
    runTool: async (context, name, toolInput) => {
      toolCalls += 1;
      if (name === "search_web" && input.webSearch) {
        const result = await runSearchWebTool(
          context,
          toolInput as { query: string },
          {
            provider: researchProvider,
            judge: async (sources, hypotheses) =>
              heuristicJudge(sources, hypotheses),
            configOverride: { enabled: true },
            loadNameTerms: async () =>
              input.webSearch?.requesterNameTerms ?? [],
            loadVendorDomains: async (organizationId) =>
              organizationId === current.organization_id
                ? (input.webSearch?.vendorDomains ?? [])
                : [],
          }
        );
        if (result.ok) {
          executedInputs.push(toolInput);
          executedTools.push(name);
        }
        return result;
      }
      const scripted = toolResults.shift() ?? {
        ok: true as const,
        value: { result: "scripted" },
        modelText:
          '<untrusted_data source="scripted">{"result":"scripted"}</untrusted_data>',
        userSummary: "Scripted read-only result.",
      };
      if (scripted.ok) {
        executedInputs.push(toolInput);
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
    proposeAction: async (
      _admin,
      _target,
      actionInput: ProposeActionInput,
      ctx
    ) => {
      proposeActionCalls += 1;
      proposalProvenance = ctx.provenance;
      if (input.realEvidenceCheck) {
        const researchRejection = researchOnlyEvidenceRejection(
          ctx.evidence,
          actionInput.hypothesisId
        );
        if (researchRejection) return researchRejection;
      }
      if (taintScenario) {
        const definition = getCapability(taintScenario.capabilityId, 1);
        if (!definition) {
          throw new Error(
            `Unknown taint-scenario capability: ${taintScenario.capabilityId}`
          );
        }
        let tainted = findTaintedParams(
          actionInput.params,
          inputSchemaJson(definition),
          ctx.provenance
        );
        if (taintScenario.deviceSignedTrust) {
          tainted = applyDeviceSignedTrust(tainted, {
            enabled: taintScenario.deviceSignedTrust.enabled,
            capability: definition,
            signedIdentifiers: taintScenario.deviceSignedTrust.identifiers,
          });
        }
        deviceSignedProposal =
          tainted.length > 0 &&
          tainted.every((item) => item.trust === "device_signed");
        const decision = taintDecision(definition, tainted);
        const undisplayable =
          decision === "reconfirm" &&
          tainted.some(
            ({ value }) =>
              value.length > 120 ||
              toUserText(value, { ...NO_REQUESTER, redactions: [] }) !== value
          );
        taintedProposal = tainted.length > 0;
        taintPolicy =
          decision === "reject" || undisplayable
            ? "deny"
            : decision === "device_signed" ||
                decision === "reconfirm" ||
                !taintScenario.autorunEligible
              ? "require_user_consent"
              : "allow_automatic";
        if (decision === "reject" || undisplayable) {
          return {
            kind: "rejected",
            code: "tainted_parameter",
            message: undisplayable
              ? "That value came from content you didn't type and can't be shown to you safely, so I can't use it in a fix."
              : "That value came from content you didn't type, so I can't use it in a fix.",
          };
        }
        if (
          decision === "device_signed" ||
          decision === "reconfirm" ||
          !taintScenario.autorunEligible
        ) {
          executePlanCalls += 1;
          const approvalRequestId = "approval-taint";
          const card = {
            approvalRequestId,
            capabilityId: definition.id,
            title: definition.description,
            whatHappens: definition.expectedResult,
            target: {
              kind: definition.id.startsWith("device_")
                ? ("device" as const)
                : ("account" as const),
              label: definition.id.startsWith("device_")
                ? "your device"
                : "your account",
            },
            reversible: definition.rollback !== "none",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            ...(tainted.length > 0 && decision !== "device_signed"
              ? {
                  tainted,
                  requiresReconfirm: true,
                }
              : {}),
          };
          if (input.consent?.decision === "approve") {
            const reconfirmed =
              input.consent.reconfirmTainted === true ||
              taintScenario.reconfirmTainted === true;
            const satisfied = reconfirmSatisfied({
              policyDecision: decision,
              lookupFailed: false,
              reconfirmTainted: reconfirmed,
            });
            if (!satisfied) {
              steps.push({
                kind: "action_rejected",
                resultSummary: "Re-confirm required.",
              });
              return {
                kind: "rejected",
                code: "policy_denied",
                message: "Re-confirm required.",
              };
            }
            executedWithoutReconfirm =
              tainted.some((item) => item.trust !== "device_signed") &&
              !reconfirmed;
            gatewayCalls += 1;
            sideEffectCalls += 1;
            executedInputs.push(actionInput.params);
            events.push({
              type: "action_executing",
              capabilityId: definition.id,
              text: "Applying the approved fix.",
            });
            return { kind: "executed", result: "executed_verified_passed" };
          }
          return { kind: "consent_required", approvalRequestId, card };
        }
        gatewayCalls += 1;
        events.push({
          type: "action_executing",
          capabilityId: definition.id,
          text: "Applying the automatic fix.",
          autorun: true,
        });
        executePlanCalls += 1;
        sideEffectCalls += 1;
        executedInputs.push(actionInput.params);
        return { kind: "executed", result: "executed_verified_passed" };
      }
      if (input.proposeActionOutcome?.kind === "consent_required")
        executePlanCalls += 1;
      if (autonomyScenario?.rollbackFailed) {
        events.push({
          type: "action_executing",
          capabilityId: "device_flush_dns",
          text: "Applied automatically.",
          autorun: true,
        });
        events.push({
          type: "verification_result",
          status: "failed",
          rollback: "failed",
          text: "The fix could not be rolled back.",
        });
        const outcome = await recordAutonomyOutcome(autonomyAdmin as never, {
          organizationId: current.organization_id,
          capabilityId: "device_flush_dns",
          runId: ticketId,
          tierAtTime: "autorun",
          outcome: "rollback_failed",
        });
        if (outcome.demoted) {
          steps.push({
            kind: "tier_demoted",
            resultSummary: "rollback_failure",
          });
          alerts += 1;
        }
        return { kind: "escalate", reason: "rollback_failed" };
      }
      if (autonomyScenario?.denylisted)
        return { kind: "escalate", reason: "denylisted" };
      if (autonomyScenario?.tier === "consent")
        return {
          kind: "consent_required",
          approvalRequestId: "approval-c3",
          card: {
            approvalRequestId: "approval-c3",
            capabilityId: "device_flush_dns",
            title: "Flush DNS",
            whatHappens: "Flush the device DNS cache.",
            target: { kind: "device", label: "your device" },
            reversible: true,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        };
      if (
        autonomyScenario?.tier === "autorun" &&
        !autonomyScenario.sessionConsent
      )
        return {
          kind: "consent_required",
          approvalRequestId: "approval-c3",
          card: {
            approvalRequestId: "approval-c3",
            capabilityId: "device_flush_dns",
            title: "Flush DNS",
            whatHappens: "Flush the device DNS cache.",
            target: { kind: "device", label: "your device" },
            reversible: true,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        };
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
    transcribe: {
      transcribe: async () => ({
        text:
          input.screenshotText ??
          "Mock transcription: Wi-Fi 'Not connected' banner visible.",
      }),
    },
    intakeScreenshots: async (_admin, _target, ids, transcriptionDeps) => {
      if (input.screenshotStatus)
        return {
          ok: false as const,
          code:
            input.screenshotStatus === "foreign"
              ? ("foreign" as const)
              : ("not_ready" as const),
          message: "That screenshot is not ready for analysis.",
        };
      const transcribed = await transcriptionDeps.transcribe.transcribe({
        bytes: new Uint8Array(),
        mime: "image/png",
        signal: transcriptionDeps.signal,
      });
      const guarded = guardModelInput([
        { source: "attachment.text", text: transcribed.text },
      ]);
      if (guarded.blocked)
        return {
          ok: false as const,
          code: "transcribe_failed" as const,
          message: "The screenshot transcription was blocked for safety.",
          injection: true,
        };
      return {
        ok: true as const,
        items: ids.map((attachmentId) => ({
          attachmentId,
          modelText: wrapUntrusted("screenshot", {
            attachmentId,
            text: transcribed.text,
          }),
          userSummary: toUserText(
            transcribed.text,
            transcriptionDeps.outputGuard ?? NO_REQUESTER
          ).slice(0, 240),
          sha256: `fixture-${attachmentId}`,
        })),
      };
    },
  };
  return {
    session: current,
    model,
    modelIds,
    providerQueries,
    researchRows: researchStore.rows,
    events,
    steps,
    get toolCalls() {
      return toolCalls;
    },
    get proposeActionCalls() {
      return proposeActionCalls;
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
    get autorunWithoutAdminPromotion() {
      return (
        !taintScenario &&
        events.some(
          (event) => event.type === "action_executing" && event.autorun === true
        ) &&
        autonomyScenario?.tier !== "autorun"
      );
    },
    get autoDemotionFailed() {
      return Boolean(
        autonomyScenario?.rollbackFailed &&
        events.some(
          (event) => event.type === "action_executing" && event.autorun === true
        ) &&
        !steps.some((step) => step.kind === "tier_demoted")
      );
    },
    get autorunWithoutSessionConsent() {
      return Boolean(
        autonomyScenario?.sessionConsent === false &&
        events.some(
          (event) => event.type === "action_executing" && event.autorun === true
        )
      );
    },
    get denylistedAutorun() {
      return Boolean(
        autonomyScenario?.denylisted &&
        events.some(
          (event) => event.type === "action_executing" && event.autorun === true
        )
      );
    },
    get taintedProposal() {
      return taintedProposal;
    },
    get deviceSignedProposal() {
      return deviceSignedProposal;
    },
    get taintPolicy() {
      return taintPolicy;
    },
    get executedWithoutReconfirm() {
      return executedWithoutReconfirm;
    },
    get proposalProvenance() {
      return proposalProvenance;
    },
    run: async () => {
      if (input.attachmentIds && input.visionEnabled === false) return;
      const previousFlags = {
        enabled: process.env.HELP_DESK_REQUESTER_AGENT_ENABLED,
        organizations: process.env.HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST,
        actions: process.env.HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED,
      };
      if (taintScenario) {
        process.env.HELP_DESK_REQUESTER_AGENT_ENABLED = "true";
        process.env.HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST =
          current.organization_id;
        process.env.HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED = "true";
      }
      try {
        await handleAgentRequest({
          admin: admin as never,
          session: current,
          message: input.message ?? "Wi-Fi keeps dropping",
          humanRequested: input.humanRequested,
          consent: taintScenario ? undefined : input.consent,
          confirm: input.confirm,
          attachmentIds:
            input.visionEnabled === false ? undefined : input.attachmentIds,
          emit: (event) => events.push(event),
          signal: new AbortController().signal,
          deps: {
            ...deps,
            runAgentTurn: async (turnInput) =>
              runAgentTurn({
                ...turnInput,
                ...(input.modelRoute === undefined ? { model } : {}),
              }),
          },
        });
      } finally {
        if (taintScenario) {
          if (previousFlags.enabled === undefined)
            delete process.env.HELP_DESK_REQUESTER_AGENT_ENABLED;
          else
            process.env.HELP_DESK_REQUESTER_AGENT_ENABLED =
              previousFlags.enabled;
          if (previousFlags.organizations === undefined)
            delete process.env.HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST;
          else
            process.env.HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST =
              previousFlags.organizations;
          if (previousFlags.actions === undefined)
            delete process.env.HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED;
          else
            process.env.HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED =
              previousFlags.actions;
        }
      }
    },
  };
}
