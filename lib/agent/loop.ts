import { alertSecurityEvent } from "@/lib/autonomy/alerts";
import { isIdentityAssuranceEnabled } from "@/lib/admin/flags";
import { checkUserMessageSafety } from "@/lib/ai/safety-policy";
import { guardModelInput } from "@/lib/autonomy/guardrails/input";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import {
  checkAndConsumeDailyBudget,
  checkOrgDailyCostBudget,
} from "@/lib/ai/budget";
import { costMicros } from "@/lib/ai/pricing";
import { recordAgentModelCall } from "@/lib/ai/telemetry";
import {
  getAgentTools,
  giveUserStepSchema,
  runTool,
  toolParamsHash,
} from "./tools";
import { budgetExceeded } from "./budgets";
import { createAgentModel, type AgentMessage, type AgentModel } from "./model";
import { countEvidenceSources, selectAgentRoute } from "./routing";
import { requesterAgentActionPrompt } from "./prompt";
import {
  checkUserStep as validateUserStep,
  type UserStepCheck,
} from "./user-steps";
import { detectTripwire } from "./tripwires";
import { isDenylisted } from "./denylist";
import { toUserText, type OutputGuardContext } from "./output-guard";
import {
  escalate,
  halt,
  loadSessionContext,
  loadSessionEvidence,
  hasServiceIncident,
  updateSession,
  writeStep,
} from "./session";
import { proposeAction } from "./actions";
import {
  isAgentCostTrackingEnabled,
  isAgentUserStepsEnabled,
  isOrgEnvironmentEnabled,
  isRequesterAgentActionsEnabled,
  isRequesterAgentEnabledForOrg,
  isServiceHealthEnabled,
  isAgentDiagnosticSourcesEnabled,
  isAgentWebSearchEnabled,
} from "@/lib/admin/flags";
import { getApprovedSlugs } from "@/lib/knowledge/governance";
import { loadConfirmedOrgEnvironment } from "@/lib/org-environment/profile";
import {
  getAllowedStatusHosts,
  isAllowedIncidentUrl,
} from "@/lib/service-health";
import { sanitizeServiceText } from "@/lib/service-health/url";
import type { AgentEvent, AgentSession } from "./types";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AssuranceFacts } from "@/lib/identity/assurance";

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
  checkOrgCostBudget: typeof checkOrgDailyCostBudget;
  recordModelCall: typeof recordAgentModelCall;
  createModel: typeof createAgentModel;
  costTrackingEnabled?: boolean;
  runTool: typeof runTool;
  writeStep: typeof writeStep;
  updateSession: typeof updateSession;
  escalate: typeof escalate;
  halt: typeof halt;
  alert: typeof alertSecurityEvent;
  loadContext: typeof loadSessionContext;
  loadEvidence: typeof loadSessionEvidence;
  proposeAction: typeof proposeAction;
  hasServiceIncident: typeof hasServiceIncident;
  serviceHealthEnabled?: boolean;
  diagnosticSourcesEnabled?: boolean;
  orgEnvironmentEnabled?: boolean;
  userStepsEnabled?: boolean;
  webSearchEnabled?: boolean;
  assurance?: AssuranceFacts;
  checkUserStep?: (input: {
    issueSlug: string;
    stepIndex: number;
    why: string;
    citationSourceId?: string;
  }) => Promise<UserStepCheck>;
  selectRoute?: typeof selectAgentRoute;
};

const defaultDeps: AgentLoopDeps = {
  budgetExceeded,
  readKillSwitches,
  checkDailyBudget: checkAndConsumeDailyBudget,
  checkOrgCostBudget: checkOrgDailyCostBudget,
  recordModelCall: recordAgentModelCall,
  createModel: createAgentModel,
  runTool,
  writeStep,
  updateSession,
  escalate,
  halt,
  alert: alertSecurityEvent,
  loadContext: loadSessionContext,
  loadEvidence: loadSessionEvidence,
  proposeAction,
  hasServiceIncident,
};

export async function runAgentTurn(input: {
  admin: Admin;
  session: AgentSession;
  userMessage: string;
  trustedSystemEvent?: boolean;
  model?: AgentModel;
  platform?: string;
  assurance?: AssuranceFacts;
  routing?: { screenshotAttached?: boolean; failedVerification?: boolean };
  outputGuard?: OutputGuardContext;
  emit: (event: AgentEvent) => void;
  signal: AbortSignal;
  deps?: Partial<AgentLoopDeps>;
}): Promise<void> {
  const { admin, session, userMessage, platform, emit, signal } = input;
  const outputGuard = input.outputGuard ?? {
    requesterIdentifiers: [],
    redactions: [],
  };
  const deps = { ...defaultDeps, ...input.deps };
  const costTrackingEnabled =
    deps.costTrackingEnabled ?? isAgentCostTrackingEnabled();
  const guarded = guardModelInput([{ source: "event", text: userMessage }]);
  const trustedEventSafetyFindings = new Set([
    "password-bypass",
    "password-request",
    "malware-report",
  ]);
  const guardedBlocked =
    guarded.blocked &&
    !(
      input.trustedSystemEvent &&
      guarded.blockReason !== null &&
      trustedEventSafetyFindings.has(guarded.blockReason)
    );
  const safety = input.trustedSystemEvent
    ? { allowed: true as const, category: undefined }
    : checkUserMessageSafety({ message: userMessage });
  const tripwire = input.trustedSystemEvent
    ? null
    : detectTripwire(userMessage);
  if (guardedBlocked || !safety.allowed || tripwire) {
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

  const modelsById = new Map<string, AgentModel>();
  const messages: AgentMessage[] = [
    ...(await deps.loadContext(admin, session)),
    { role: "user", content: userMessage },
  ];
  const evidence = await deps.loadEvidence(admin, session);
  const actionToolsEnabled =
    isRequesterAgentActionsEnabled() &&
    isRequesterAgentEnabledForOrg(session.organization_id);
  const serviceHealthEnabled =
    deps.serviceHealthEnabled ?? isServiceHealthEnabled();
  const diagnosticSourcesEnabled =
    deps.diagnosticSourcesEnabled ?? isAgentDiagnosticSourcesEnabled();
  const orgEnvironmentEnabled =
    deps.orgEnvironmentEnabled ?? isOrgEnvironmentEnabled();
  const userStepsEnabled = deps.userStepsEnabled ?? isAgentUserStepsEnabled();
  const webSearchEnabled = deps.webSearchEnabled ?? isAgentWebSearchEnabled();
  const checkUserStep =
    deps.checkUserStep ??
    (async (stepInput) =>
      validateUserStep(stepInput, {
        approvedSlugs: new Set(await getApprovedSlugs(session.organization_id)),
        approvedSoftware:
          (await loadConfirmedOrgEnvironment(admin, session.organization_id))
            ?.approvedSoftware ?? [],
        loadResearchSource: async (id) => {
          const result = await admin
            .from("research_sources")
            .select("trust,domain,title,url")
            .eq("id", id)
            .eq("organization_id", session.organization_id)
            .eq("agent_session_id", session.id)
            .maybeSingle();
          if (result.error || !result.data) return null;
          return result.data;
        },
      }));
  let serviceIncidentActive = false;
  if (serviceHealthEnabled) {
    try {
      serviceIncidentActive = await deps.hasServiceIncident(admin, session);
    } catch {
      serviceIncidentActive = true;
    }
  }
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
    if (
      costTrackingEnabled &&
      !(await deps.checkOrgCostBudget(admin, session.organization_id))
    ) {
      const ticketId = await deps.escalate(
        admin,
        session,
        "budget:org_cost",
        userMessage
      );
      emit({ type: "escalated", ticketId, reason: "budget:org_cost" });
      return;
    }
    const route = (deps.selectRoute ?? selectAgentRoute)({
      evidenceSources: countEvidenceSources(evidence),
      failedVerification:
        Boolean(input.routing?.failedVerification) ||
        (session.failed_hypotheses ?? 0) > 0,
      screenshotAttached: Boolean(input.routing?.screenshotAttached),
    });
    let model = input.model;
    if (!model) {
      model =
        modelsById.get(route.model) ??
        deps.createModel(userMessage, route.model);
      modelsById.set(route.model, model);
    }
    modelTurns += 1;
    session.model_turn_count = modelTurns;
    await deps.updateSession(admin, session, { model_turn_count: modelTurns });
    const result = await model.next({
      system: requesterAgentActionPrompt(
        actionToolsEnabled,
        serviceHealthEnabled,
        orgEnvironmentEnabled,
        diagnosticSourcesEnabled,
        userStepsEnabled,
        webSearchEnabled,
        isIdentityAssuranceEnabled() ? input.assurance?.level : undefined
      ),
      messages,
      tools: getAgentTools(
        actionToolsEnabled,
        serviceHealthEnabled,
        orgEnvironmentEnabled,
        diagnosticSourcesEnabled,
        userStepsEnabled,
        webSearchEnabled
      ).map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Record<string, unknown>,
      })),
      maxTokens: 1200,
      signal,
    });
    if (costTrackingEnabled && result.usage) {
      const modelId = result.model ?? route.model;
      const usage = result.usage;
      const tokens =
        usage.inputTokens +
        usage.outputTokens +
        usage.cacheCreationInputTokens +
        usage.cacheReadInputTokens;
      const callCostMicros = costMicros(modelId, usage);
      session.token_count += tokens;
      session.cost_micros = (session.cost_micros ?? 0) + callCostMicros;
      const costUpdates: Partial<AgentSession> = {
        token_count: session.token_count,
        cost_micros: session.cost_micros,
      };
      if (route.tier === "planner") {
        session.planner_turn_count = (session.planner_turn_count ?? 0) + 1;
        costUpdates.planner_turn_count = session.planner_turn_count;
      }
      await deps.updateSession(admin, session, costUpdates);
      deps.recordModelCall({
        organizationId: session.organization_id,
        model: modelId,
        route: route.tier === "planner" ? "agent_planner" : "agent_default",
        usage,
        costMicros: callCostMicros,
      });
    }
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
      const text = toUserText(finalText.text, outputGuard).slice(0, 1200);
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
    if (result.name === "give_user_step" && userStepsEnabled) {
      const parsed = giveUserStepSchema.safeParse(result.input);
      const checked = parsed.success
        ? await checkUserStep(parsed.data)
        : {
            ok: false as const,
            code: "step_not_found" as const,
            message: "That step could not be found in the approved guide.",
          };
      toolCalls += 1;
      session.tool_call_count = toolCalls;
      await deps.updateSession(admin, session, { tool_call_count: toolCalls });
      if (!checked.ok) {
        const rejection = `User step rejected: ${checked.code}`;
        const paramsHash = toolParamsHash(result.name, result.input);
        await deps.writeStep(admin, session, {
          kind: "tool_rejected",
          toolName: result.name,
          paramsHash,
          resultSummary: rejection,
        });
        emit({
          type: "tool_result_summary",
          tool: result.name,
          summary: rejection,
        });
        const key = `${result.name}:${paramsHash}`;
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
          { role: "tool_result", tool_use_id: result.id, content: rejection }
        );
        continue;
      }
      if (!parsed.success) continue;
      const instruction = toUserText(checked.instruction, outputGuard);
      const why = toUserText(checked.why, outputGuard);
      const source = {
        ...checked.source,
        title: toUserText(checked.source.title, outputGuard),
      };
      const citation = checked.citation
        ? {
            ...checked.citation,
            title: toUserText(checked.citation.title, outputGuard),
            domain: toUserText(checked.citation.domain, outputGuard),
          }
        : undefined;
      const stepId = await deps.writeStep(admin, session, {
        kind: "user_step_offered",
        toolName: result.name,
        paramsHash: `${parsed.data.issueSlug}#${parsed.data.stepIndex}`,
        resultSummary: JSON.stringify({
          guideSlug: source.guideSlug,
          stepIndex: checked.source.stepIndex,
          why,
          ...(parsed.data.citationSourceId
            ? { citationSourceId: parsed.data.citationSourceId }
            : {}),
          ...(citation
            ? {
                citation: {
                  title: citation.title,
                  domain: citation.domain,
                },
              }
            : {}),
        }),
      });
      if (!stepId) {
        emit({
          type: "error",
          message: "That step could not be saved. Please try again.",
          recoverable: true,
        });
        return;
      }
      emit({
        type: "user_step",
        card: {
          stepId,
          instruction,
          why,
          source,
          ...(citation ? { citation } : {}),
        },
      });
      return;
    }
    if (result.name === "propose_action") {
      const actionInput = result.input as Record<string, unknown>;
      const action = serviceIncidentActive
        ? {
            kind: "rejected" as const,
            code: "service_incident_active" as const,
            message:
              "A matching service outage is active, so actions are paused for this session.",
          }
        : await deps.proposeAction(
            admin,
            session,
            {
              capabilityId: String(actionInput.capability_id ?? ""),
              params:
                actionInput.params && typeof actionInput.params === "object"
                  ? (actionInput.params as Record<string, unknown>)
                  : {},
              hypothesisId: String(actionInput.hypothesis_id ?? ""),
              rationale: String(actionInput.rationale ?? ""),
            },
            {
              evidence,
              actor: `requester_agent:${session.id}`,
              platform,
              emit,
              signal,
              assurance: input.assurance,
            }
          );
      if (action.kind === "consent_required") {
        emit({
          type: "action_proposed",
          capabilityId: action.card.capabilityId,
          text: action.card.title,
        });
        emit({ type: "consent_required", card: action.card });
        return;
      }
      if (action.kind === "executed") {
        return;
      }
      if (action.kind === "escalate") {
        if (action.reason === "denylisted") {
          const ticketId = await deps.halt(
            admin,
            session,
            "denylisted",
            userMessage,
            true
          );
          emit({ type: "halted", reason: "denylisted", ticketId });
          return;
        }
        const ticketId = await deps.escalate(
          admin,
          session,
          action.reason,
          userMessage
        );
        emit({ type: "escalated", ticketId, reason: action.reason });
        return;
      }
      toolCalls += 1;
      session.tool_call_count = toolCalls;
      await deps.updateSession(admin, session, { tool_call_count: toolCalls });
      const rejection = `Action rejected: ${action.code} — ${action.message}`;
      const rejectionParamsHash = toolParamsHash(result.name, result.input);
      await deps.writeStep(admin, session, {
        kind: "action_rejected",
        toolName: result.name,
        capabilityId: String(actionInput.capability_id ?? ""),
        paramsHash: rejectionParamsHash,
        resultSummary: rejection,
      });
      if (action.code === "tier_shadow" || action.code === "tier_disabled") {
        emit({
          type: "tool_result_summary",
          tool: result.name,
          summary: action.message,
        });
      }
      const rejectionKey = `${result.name}:${rejectionParamsHash}`;
      const rejectionRepeats = (seen.get(rejectionKey) ?? 0) + 1;
      seen.set(rejectionKey, rejectionRepeats);
      if (rejectionRepeats >= 3) {
        const ticketId = await deps.escalate(
          admin,
          session,
          "loop_detected",
          userMessage
        );
        emit({ type: "escalated", ticketId, reason: "loop_detected" });
        return;
      }
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
        { role: "tool_result", tool_use_id: result.id, content: rejection }
      );
      continue;
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
    const thinking = toUserText(summary(result.summary), outputGuard);
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
      resultSummary: thinking,
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
              outputGuard,
            },
            result.name,
            result.input
          );
    if (result.name === "search_web" && tool.ok) {
      const rawSources =
        tool.value && typeof tool.value === "object" && "sources" in tool.value
          ? tool.value.sources
          : null;
      if (Array.isArray(rawSources)) {
        const sources = rawSources.flatMap((source) => {
          if (!source || typeof source !== "object") return [];
          const item = source as Record<string, unknown>;
          if (
            typeof item.title !== "string" ||
            typeof item.domain !== "string" ||
            typeof item.url !== "string" ||
            (item.trust !== "vendor" && item.trust !== "community")
          )
            return [];
          try {
            if (new URL(item.url).protocol !== "https:") return [];
          } catch {
            return [];
          }
          return [
            {
              title: item.title,
              domain: item.domain,
              url: item.url,
              trust: item.trust as "vendor" | "community",
            },
          ];
        });
        if (sources.length > 0) emit({ type: "web_sources", sources });
      }
    }
    const toolSummary = toUserText(tool.userSummary, outputGuard);
    const evidenceId = tool.ok ? `ev-${toolCalls + 1}` : null;
    const persistedSummary = evidenceId
      ? `[evidence id: ${evidenceId}] ${toolSummary}`
      : toolSummary;
    await deps.writeStep(admin, session, {
      kind: tool.ok ? "tool_result" : "tool_rejected",
      toolName: result.name,
      paramsHash: toolParamsHash(result.name, result.input),
      resultSummary: persistedSummary,
    });
    toolCalls += 1;
    session.tool_call_count = toolCalls;
    await deps.updateSession(admin, session, { tool_call_count: toolCalls });
    if (evidenceId) evidence.push({ id: evidenceId, tool: result.name });
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
    if (
      tool.ok &&
      result.name === "get_service_health" &&
      tool.value &&
      typeof tool.value === "object" &&
      "matched" in tool.value &&
      Array.isArray(tool.value.matched) &&
      tool.value.matched.length > 0
    ) {
      serviceIncidentActive = true;
      const matched = tool.value.matched as Array<{
        source: "microsoft365" | "google_workspace" | "statuspage";
        incidentId: string;
        service: string;
        title: string;
        impact: "outage" | "degraded" | "informational";
        url: string;
      }>;
      await deps.writeStep(admin, session, {
        kind: "service_incident",
        toolName: result.name,
        resultSummary: matched
          .map(({ source, incidentId }) => `${source}:${incidentId}`)
          .join(",")
          .slice(0, 300),
      });
      const configuredHosts = await getAllowedStatusHosts(
        admin,
        session.organization_id
      );
      const allowedIncidents = matched
        .filter(
          (incident) =>
            /^[A-Za-z0-9._:-]{1,128}$/.test(incident.incidentId) &&
            ["microsoft365", "google_workspace", "statuspage"].includes(
              incident.source
            ) &&
            ["outage", "degraded", "informational"].includes(incident.impact) &&
            isAllowedIncidentUrl(incident.url, configuredHosts)
        )
        .map((incident) => ({
          source: incident.source,
          incidentId: incident.incidentId,
          service: sanitizeServiceText(incident.service, 80),
          title: sanitizeServiceText(incident.title, 200),
          impact: incident.impact,
          url: incident.url,
        }));
      if (allowedIncidents.length > 0)
        emit({ type: "service_incident", incidents: allowedIncidents });
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
        content: evidenceId
          ? `${tool.modelText}\n[evidence id: ${evidenceId}]`
          : tool.modelText,
      }
    );
  }
}
