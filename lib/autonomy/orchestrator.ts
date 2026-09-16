import { isEscalationPackageEnabled } from "@/lib/investigation/config";
import { snapshotEscalationPackage } from "@/lib/investigation/escalation";
import { isEvidenceEngineEnabled } from "@/lib/admin/flags";
import { snapshotEvidence } from "@/lib/evidence/snapshot";
import { runResearch } from "@/lib/research";
import { createAdminClient } from "@/lib/supabase/admin";
import { event } from "@/lib/tickets/events";
import { assertTransition, isTerminal, type RunStatus } from "./state-machine";
import {
  getAutonomyLimits,
  getPlannerMode,
  getPlannerProvider,
  isAutonomyEnabled,
  isVerificationEngineEnabled,
  isPlannerEnabled,
  isShadowModeEnabled,
} from "./config";
import { readKillSwitches } from "./kill-switches";
import {
  isCapabilityEnabled,
  listEnabledCapabilities,
} from "./capabilities/enablement";
import {
  getCapability,
  inputSchemaJson,
  listCapabilities,
} from "./capabilities/registry";
import { evaluatePlanPolicy, executePlan } from "./executor/execute";
import { resumeAfterApproval } from "./executor/resume";
import { recordPolicyDecision } from "./policy/record";
import { selectPlanner } from "./planner/select";
import { ensurePlannerRegistered } from "./planner/bootstrap";
import { loadDirectoryForOrganization } from "./connectors";
import { bindRequesterIdentity } from "./connectors/binding";
import { getIdentityBinding } from "./connectors/binding";
import { isIdentityFamily } from "@/lib/evidence/identity-family";
import { DeterministicPlanner } from "./planner/deterministic-planner";
import { verifyRun } from "./verification/engine";
import { redactAuditDetail } from "./audit/redact";
import { auditVersions, initiatedBy } from "./audit/versions";
import { alertSecurityEvent } from "./alerts";
import { guardModelInput, type UntrustedField } from "./guardrails/input";
import {
  validatePlannerOutput,
  type PlannerOutput,
} from "./guardrails/planner-output";

export type OrchestratorAdmin = ReturnType<typeof createAdminClient>;

export type ResolutionRun = {
  id: string;
  organization_id: string;
  ticket_id: string;
  status: RunStatus;
  previous_status: RunStatus | null;
  attempts: number;
  max_attempts: number;
  cost_cents: number;
  budget_cents: number;
  deadline_at: string;
  initiated_by: string;
  planner_version: string | null;
  model: string | null;
  prompt_version: string | null;
  policy_version: string | null;
  escalation_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

async function optionalTicketRows(
  admin: OrchestratorAdmin,
  table: "ticket_attachments" | "ticket_comments" | "ticket_system_events",
  selection: string,
  organizationId: string,
  ticketId: string
): Promise<unknown[]> {
  try {
    const result = await admin
      .from(table)
      .select(selection)
      .eq("organization_id", organizationId)
      .eq("ticket_id", ticketId);
    return (result.data ?? []) as unknown[];
  } catch {
    return [];
  }
}

export function resolutionStepPosition(
  attempts: number,
  kind: "plan" | "policy" | "execute"
): number {
  return attempts * 3 + { plan: 0, policy: 1, execute: 2 }[kind];
}

type RunEvent = {
  organization_id: string;
  run_id: string;
  ticket_id: string;
  kind: string;
  actor: string;
  from_status?: string | null;
  to_status?: string | null;
  detail?: Record<string, unknown>;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function writeRunEvent(
  admin: OrchestratorAdmin,
  input: RunEvent
): Promise<void> {
  await admin.from("resolution_events").insert({
    organization_id: input.organization_id,
    run_id: input.run_id,
    ticket_id: input.ticket_id,
    kind: input.kind,
    actor: input.actor,
    from_status: input.from_status ?? null,
    to_status: input.to_status ?? null,
    detail: redactAuditDetail(input.detail ?? {}),
    initiated_by: initiatedBy(input.actor),
    versions: auditVersions(),
  });
}

async function writeShadowDecision(
  admin: OrchestratorAdmin,
  run: ResolutionRun,
  input: {
    plan: Record<string, unknown>;
    planner: string;
    plannerVersion: string;
    plannerProvider: string;
    policyDecision?: string | null;
    policyReasons?: string[];
    capability?: { id: string; version: number } | null;
    inputBlocked?: boolean;
    outputRejected?: boolean;
    rejectionReason?: string | null;
    latencyMs?: number | null;
  }
): Promise<void> {
  if (!isShadowModeEnabled()) return;
  await admin.from("shadow_decisions").insert({
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    plan: redactAuditDetail(input.plan),
    planner: input.planner,
    planner_version: input.plannerVersion,
    planner_provider: input.plannerProvider,
    policy_decision: input.policyDecision ?? null,
    policy_reasons: input.policyReasons ?? [],
    would_execute_capability_id: input.capability?.id ?? null,
    would_execute_capability_version: input.capability?.version ?? null,
    input_blocked: input.inputBlocked ?? false,
    output_rejected: input.outputRejected ?? false,
    rejection_reason: input.rejectionReason ?? null,
    versions: auditVersions(input.capability),
    latency_ms: input.latencyMs ?? null,
    cost_cents: 0,
  });
}

async function updateRun(
  admin: OrchestratorAdmin,
  run: ResolutionRun,
  patch: Record<string, unknown>
): Promise<ResolutionRun> {
  const result = await admin
    .from("resolution_runs")
    .update(patch)
    .eq("id", run.id)
    .eq("organization_id", run.organization_id)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return (result.data ?? { ...run, ...patch }) as ResolutionRun;
}

async function planRun(
  admin: OrchestratorAdmin,
  run: ResolutionRun
): Promise<ResolutionRun | null> {
  ensurePlannerRegistered();
  const planning =
    run.status === "planning"
      ? run
      : await transitionRun(admin, run, "planning", {
          actor: "orchestrator",
        });
  if (!planning) return null;
  const ticketResult = await admin
    .from("tickets")
    .select(
      "id,issue_title,message,category,platform,diagnostic_answers,user_id"
    )
    .eq("id", run.ticket_id)
    .eq("organization_id", run.organization_id)
    .maybeSingle();
  if (ticketResult.error || !ticketResult.data) {
    return escalateRun(admin, planning, "ticket_not_found");
  }
  const identityTicket = isIdentityFamily(
    ticketResult.data.category,
    ticketResult.data.message
  );
  const existingBinding =
    identityTicket && process.env.HELP_DESK_CONNECTOR_KEY
      ? await getIdentityBinding(admin, run.id)
      : null;
  if (
    identityTicket &&
    !existingBinding &&
    process.env.HELP_DESK_CONNECTOR_KEY &&
    ticketResult.data.user_id
  ) {
    const directory = await loadDirectoryForOrganization(
      admin,
      run.organization_id
    );
    if (directory) {
      await bindRequesterIdentity(admin, directory.directory, {
        runId: run.id,
        ticketId: run.ticket_id,
        organizationId: run.organization_id,
        userId: ticketResult.data.user_id,
      });
    }
  }
  const [attachments, comments, events] = await Promise.all([
    optionalTicketRows(
      admin,
      "ticket_attachments",
      "id,original_name,declared_mime,status,scan_verdict",
      run.organization_id,
      run.ticket_id
    ),
    optionalTicketRows(
      admin,
      "ticket_comments",
      "message",
      run.organization_id,
      run.ticket_id
    ),
    optionalTicketRows(
      admin,
      "ticket_system_events",
      "event_type,detail",
      run.organization_id,
      run.ticket_id
    ),
  ]);
  const evidenceBase = isEvidenceEngineEnabled()
    ? await snapshotEvidence(admin, run.ticket_id, run.organization_id)
    : null;
  const research =
    evidenceBase && process.env.HELP_DESK_RESEARCH_ENABLED === "true"
      ? await runResearch(admin, {
          organizationId: run.organization_id,
          runId: run.id,
          ticketId: run.ticket_id,
          category: ticketResult.data.category ?? null,
          platform: ticketResult.data.platform ?? null,
          evidence: evidenceBase,
          signal: AbortSignal.timeout(8000),
        })
      : null;
  const evidence = evidenceBase
    ? research
      ? await snapshotEvidence(admin, run.ticket_id, run.organization_id, {
          queries: research.queries,
          sources: research.sources,
        })
      : evidenceBase
    : null;
  const fields: UntrustedField[] = [];
  const ticket = ticketResult.data as {
    issue_title?: string | null;
    message?: string | null;
    diagnostic_answers?: unknown;
  };
  if (ticket.issue_title) {
    fields.push({ source: "ticket.title", text: ticket.issue_title });
  }
  if (ticket.message) {
    fields.push({ source: "ticket.description", text: ticket.message });
  }
  if (Array.isArray(ticket.diagnostic_answers)) {
    for (const answer of ticket.diagnostic_answers) {
      if (
        answer &&
        typeof answer === "object" &&
        "answer" in answer &&
        typeof answer.answer === "string"
      ) {
        fields.push({ source: "diagnostic.answer", text: answer.answer });
      }
    }
  }
  for (const attachment of attachments) {
    const row = attachment as {
      id: string;
      original_name: string;
      declared_mime: string | null;
      status: string;
      scan_verdict: string | null;
    };
    fields.push({
      source: "attachment.filename",
      text: row.original_name,
    });
    fields.push({
      source: "attachment.metadata",
      text: JSON.stringify({
        mime: row.declared_mime,
        status: row.status,
        verdict: row.scan_verdict,
      }),
    });
  }
  for (const comment of comments) {
    const message = (comment as { message?: unknown }).message;
    if (typeof message === "string")
      fields.push({ source: "comment", text: message });
  }
  for (const event of events) {
    const row = event as { event_type?: unknown; detail?: unknown };
    fields.push({
      source: "event",
      text: JSON.stringify({ type: row.event_type, detail: row.detail }),
    });
  }
  for (const source of research?.sources.slice(0, 3) ?? []) {
    fields.push({
      source: "externalSources",
      text: `${source.title}: ${source.snippet.slice(0, 1500)}`,
    });
  }
  const guardedInput = guardModelInput(fields, {
    maxChars: getAutonomyLimits().maxPlannerInputChars,
  });
  if (guardedInput.redactions > 0) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "guardrail.input_redacted",
      actor: "orchestrator",
      detail: { redactions: guardedInput.redactions },
    });
  }
  if (guardedInput.findings.length > 0) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "guardrail.prompt_injection_detected",
      actor: "orchestrator",
      detail: {
        findings: guardedInput.findings.map(({ category, source }) => ({
          category,
          source,
        })),
      },
    });
  }
  if (guardedInput.blocked) {
    await writeShadowDecision(admin, planning, {
      plan: {
        ticketId: run.ticket_id,
        decision: "no_action",
        reason: "input_blocked",
      },
      planner: "blocked",
      plannerVersion: "guardrail",
      plannerProvider: getPlannerProvider(),
      inputBlocked: true,
      rejectionReason: guardedInput.blockReason,
    });
    return escalateRun(admin, planning, "guardrail_blocked");
  }
  const failedNotification = await admin
    .from("notification_outbox")
    .select("id")
    .eq("organization_id", run.organization_id)
    .eq("ticket_id", run.ticket_id)
    .in("status", ["failed", "dead"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const attemptsResult = await admin
    .from("capability_executions")
    .select("capability_id,capability_version,status")
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id);
  const priorAttempts = (
    (attemptsResult.data ?? []) as {
      capability_id: string;
      capability_version: number;
      status: "succeeded" | "failed" | "timed_out";
    }[]
  ).map((attempt) => ({
    capabilityId: attempt.capability_id,
    version: attempt.capability_version,
    status: attempt.status,
  }));
  const enabledCapabilities = await listEnabledCapabilities(
    admin,
    run.organization_id
  );
  const allowedCapabilities = enabledCapabilities.flatMap((enabled) => {
    const capability = getCapability(enabled.id, enabled.version);
    return capability
      ? [
          {
            id: capability.id,
            version: capability.version,
            description: capability.description,
            inputSchemaJson: inputSchemaJson(capability),
            verification: capability.verification,
          },
        ]
      : [];
  });
  const providerCalls = await admin
    .from("resolution_events")
    .select("id")
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .in("kind", ["plan.received", "plan.rejected"]);
  if (
    !providerCalls.error &&
    (providerCalls.data?.length ?? 0) >=
      getAutonomyLimits().maxProviderCallsPerRun
  ) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "guardrail.rate_limited",
      actor: "orchestrator",
      detail: {
        reasonCode: "provider_limit",
        limit: getAutonomyLimits().maxProviderCallsPerRun,
      },
    });
    return escalateRun(admin, planning, "provider_limit");
  }
  const providerSwitches = await readKillSwitches(
    admin,
    run.organization_id,
    undefined,
    getPlannerProvider()
  );
  if (providerSwitches.provider) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "guardrail.kill_switch_blocked",
      actor: "orchestrator",
      detail: { scope: "provider", provider: getPlannerProvider() },
    });
  }
  const planner =
    providerSwitches.provider && getPlannerProvider() !== "deterministic"
      ? new DeterministicPlanner()
      : selectPlanner();
  let raw: unknown;
  const plannerStarted = Date.now();
  try {
    raw = await planner.plan(
      {
        evidence,
        untrustedContext: guardedInput.fields,
        ticket: {
          id: run.ticket_id,
          category: ticketResult.data.category ?? null,
          platform: ticketResult.data.platform ?? null,
          ...(failedNotification.data?.id
            ? { context: { failedNotificationId: failedNotification.data.id } }
            : {}),
        },
        allowedCapabilities,
        priorAttempts,
      },
      AbortSignal.timeout(30_000)
    );
  } catch {
    const noAction = {
      ticketId: run.ticket_id,
      diagnosis: {
        summary: "Planner provider unavailable.",
        confidence: 0,
        evidenceIds: ["ticket"],
      },
      decision: "no_action" as const,
      reason: "provider_unavailable",
    };
    await admin.from("resolution_steps").insert({
      organization_id: run.organization_id,
      run_id: run.id,
      kind: "plan",
      position: resolutionStepPosition(run.attempts, "plan"),
      status: "done",
      detail: {
        plan: noAction,
        planner: planner.id,
        plannerVersion: planner.version,
        plannerProvider: getPlannerProvider(),
      },
    });
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "plan.no_action",
      actor: "orchestrator",
      detail: { reason: "provider_unavailable" },
    });
    await writeShadowDecision(admin, planning, {
      plan: noAction,
      planner: planner.id,
      plannerVersion: planner.version,
      plannerProvider: getPlannerProvider(),
      policyDecision: "no_action",
      rejectionReason: "provider_unavailable",
      latencyMs: Date.now() - plannerStarted,
    });
    return escalateRun(admin, planning, "provider_unavailable");
  }
  await writeRunEvent(admin, {
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind: "plan.received",
    actor: "orchestrator",
    detail: { planner: planner.id, plannerVersion: planner.version },
  });
  const candidate =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  const candidateRecord =
    candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : null;
  const candidateCapability =
    candidateRecord &&
    candidateRecord.capability &&
    typeof candidateRecord.capability === "object"
      ? (candidateRecord.capability as Record<string, unknown>)
      : null;
  const candidateId =
    typeof candidateCapability?.id === "string" ? candidateCapability.id : "";
  const candidateVersion =
    typeof candidateCapability?.version === "number"
      ? candidateCapability.version
      : 0;
  const capability = candidateId
    ? getCapability(candidateId, candidateVersion)
    : null;
  const knownCapability = candidateId
    ? listCapabilities().some(({ id }) => id === candidateId)
    : false;
  const validation = validatePlannerOutput(raw, {
    runTicketId: run.ticket_id,
    evidenceIds: [
      "ticket",
      ...(evidence?.confirmedFacts.map((fact) => fact.id) ?? []),
      ...(evidence?.hypotheses.map((hypothesis) => hypothesis.id) ?? []),
    ],
    capability,
    capabilityIdKnown: knownCapability,
    orgEnabled: capability
      ? await isCapabilityEnabled(admin, {
          organizationId: run.organization_id,
          id: capability.id,
          version: capability.version,
        })
      : false,
  });
  if (!validation.ok) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "plan.rejected",
      actor: "orchestrator",
      detail: { issues: validation.issues },
    });
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "guardrail.output_rejected",
      actor: "orchestrator",
      detail: { code: validation.code, issueCount: validation.issues.length },
    });
    await writeShadowDecision(admin, planning, {
      plan: {
        decision: "no_action",
        reason: "plan_rejected",
        issues: validation.issues,
      },
      planner: planner.id,
      plannerVersion: planner.version,
      plannerProvider: getPlannerProvider(),
      outputRejected: true,
      rejectionReason: validation.code,
      latencyMs: Date.now() - plannerStarted,
    });
    return escalateRun(admin, planning, "plan_rejected");
  }
  const parsed: { ok: true; value: PlannerOutput } = {
    ok: true,
    value: validation.plan,
  };
  const planStep = await admin
    .from("resolution_steps")
    .insert({
      organization_id: run.organization_id,
      run_id: run.id,
      kind: "plan",
      position: resolutionStepPosition(run.attempts, "plan"),
      status: "done",
      detail: {
        plan: parsed.value,
        planner: planner.id,
        plannerVersion: planner.version,
        plannerProvider: getPlannerProvider(),
      },
    })
    .select("id")
    .single();
  if (planStep.error || !planStep.data) {
    return escalateRun(admin, planning, "plan_persistence_failed");
  }
  if (getPlannerMode() === "shadow") {
    const evaluated = await evaluatePlanPolicy(
      admin,
      planning,
      parsed.value,
      planStep.data.id
    );
    const recorded = evaluated.ok
      ? await recordPolicyDecision(admin, {
          organizationId: run.organization_id,
          runId: run.id,
          stepId: planStep.data.id,
          input: evaluated.input,
          decision: evaluated.decision,
        })
      : null;
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "plan.shadow",
      actor: "orchestrator",
      detail: {
        plan: parsed.value,
        decision: evaluated.ok ? evaluated.decision.decision : null,
        reasons: evaluated.ok ? evaluated.decision.reasons : [],
        rejection: evaluated.ok ? null : evaluated.reason,
        policyDecisionId: recorded?.ok ? recorded.id : null,
      },
    });
    await writeShadowDecision(admin, planning, {
      plan: parsed.value as unknown as Record<string, unknown>,
      planner: planner.id,
      plannerVersion: planner.version,
      plannerProvider: getPlannerProvider(),
      policyDecision: evaluated.ok ? evaluated.decision.decision : null,
      policyReasons: evaluated.ok ? evaluated.decision.reasons : [],
      capability:
        parsed.value.decision === "propose_action"
          ? {
              id: parsed.value.capability.id,
              version: parsed.value.capability.version,
            }
          : null,
      rejectionReason: evaluated.ok ? null : evaluated.reason,
      latencyMs: Date.now() - plannerStarted,
    });
    return escalateRun(admin, planning, "shadow_mode");
  }
  return executePlan(admin, planning, parsed.value, {
    stepId: planStep.data.id,
  });
}

function limitsExceeded(run: ResolutionRun, now = Date.now()): boolean {
  return (
    new Date(run.deadline_at).getTime() <= now ||
    run.attempts >= run.max_attempts ||
    run.cost_cents >= run.budget_cents
  );
}

export async function startRun(
  admin: OrchestratorAdmin,
  input: {
    ticketId: string;
    organizationId: string;
    initiatedBy: string;
  }
): Promise<
  | { run: ResolutionRun; created: boolean }
  | { error: "rate_limited"; run: null; created: false }
> {
  const limits = getAutonomyLimits();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const countRuns = async (userId?: string) => {
    let query = admin
      .from("resolution_runs")
      .select("id")
      .eq("organization_id", input.organizationId)
      .gte("created_at", startOfDay.toISOString());
    if (userId) query = query.eq("initiated_by", userId);
    return query;
  };
  const probe = admin.from("resolution_runs").select("id");
  if (typeof probe.gte === "function") {
    const [organizationRuns, userRuns] = await Promise.all([
      countRuns(),
      countRuns(input.initiatedBy),
    ]);
    if (organizationRuns.error || userRuns.error) {
      return { error: "rate_limited", run: null, created: false };
    }
    if ((organizationRuns.data?.length ?? 0) >= limits.maxRunsPerOrgPerDay) {
      return { error: "rate_limited", run: null, created: false };
    }
    if ((userRuns.data?.length ?? 0) >= limits.maxRunsPerUserPerDay) {
      return { error: "rate_limited", run: null, created: false };
    }
  }
  const deadline = new Date(Date.now() + limits.runtimeMs).toISOString();
  const inserted = await admin
    .from("resolution_runs")
    .insert({
      ticket_id: input.ticketId,
      organization_id: input.organizationId,
      status: "queued",
      attempts: 0,
      cost_cents: 0,
      max_attempts: limits.maxAttempts,
      budget_cents: limits.budgetCents,
      deadline_at: deadline,
      initiated_by: input.initiatedBy,
    })
    .select("*")
    .single();

  if (!inserted.error) {
    const run = inserted.data as ResolutionRun;
    await writeRunEvent(admin, {
      organization_id: input.organizationId,
      run_id: run.id,
      ticket_id: input.ticketId,
      kind: "run.created",
      actor: input.initiatedBy,
      to_status: "queued",
    });
    return { run, created: true };
  }

  if (!isUniqueViolation(inserted.error)) throw inserted.error;
  const existing = await admin
    .from("resolution_runs")
    .select("*")
    .eq("ticket_id", input.ticketId)
    .eq("organization_id", input.organizationId)
    .not("status", "in", "(resolved,escalated,failed)")
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw inserted.error;
  return { run: existing.data as ResolutionRun, created: false };
}

export async function escalateRun(
  admin: OrchestratorAdmin,
  run: ResolutionRun,
  reason: string
): Promise<ResolutionRun | null> {
  try {
    if (run.status === "resolved") return run;
    const now = new Date().toISOString();
    const updated = await updateRun(admin, run, {
      status: "escalated",
      escalation_reason: reason.slice(0, 500),
      completed_at: now,
      previous_status: null,
    });
    const ticketUpdate = await admin
      .from("tickets")
      .update({
        status: "Needs Human",
        handoff_reason: reason,
        needs_human_at: now,
        escalated: true,
        resolver_type: "unassigned",
      })
      .eq("id", run.ticket_id)
      .eq("organization_id", run.organization_id);
    if (ticketUpdate.error) throw ticketUpdate.error;
    if (isEscalationPackageEnabled()) {
      await snapshotEscalationPackage(
        admin,
        run.ticket_id,
        run.organization_id
      );
    }
    await event(
      run.ticket_id,
      run.organization_id,
      "ai.escalated",
      "ai",
      null,
      { reason, runId: run.id }
    );
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "run.transition",
      actor: "orchestrator",
      from_status: run.status,
      to_status: "escalated",
      detail: { reason },
    });
    return updated;
  } catch (error) {
    console.error("autonomy escalation failed", error);
    return null;
  }
}

export async function transitionRun(
  admin: OrchestratorAdmin,
  run: ResolutionRun,
  to: RunStatus,
  input: { actor: string; detail?: Record<string, unknown> }
): Promise<ResolutionRun | null> {
  if (isTerminal(run.status)) return run;
  const switches = await readKillSwitches(admin, run.organization_id);
  if (switches.anyActive) {
    if (run.status === "paused") return run;
    const paused = await updateRun(admin, run, {
      status: "paused",
      previous_status: run.status,
    });
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "security.kill_switch",
      actor: input.actor,
      from_status: run.status,
      to_status: "paused",
      detail: { reasons: switches.reasons },
    });
    await alertSecurityEvent(admin, {
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      runId: run.id,
      kind: "security.kill_switch",
      detail: { reasons: switches.reasons },
    });
    return paused;
  }
  if (limitsExceeded(run)) {
    return escalateRun(admin, run, "limits_exceeded");
  }
  assertTransition(run.status, to);
  const patch: Record<string, unknown> = {
    status: to,
    completed_at: isTerminal(to) ? new Date().toISOString() : null,
  };
  if (to === "paused") patch.previous_status = run.status;
  const updated = await updateRun(admin, run, patch);
  await writeRunEvent(admin, {
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind: "run.transition",
    actor: input.actor,
    from_status: run.status,
    to_status: to,
    detail: input.detail,
  });
  return updated;
}

export async function pauseRun(
  admin: OrchestratorAdmin,
  run: ResolutionRun,
  actor: string,
  reason: string
): Promise<ResolutionRun | null> {
  if (isTerminal(run.status) || run.status === "paused") return run;
  return transitionRun(admin, run, "paused", {
    actor,
    detail: { reason },
  });
}

export async function resumeRun(
  admin: OrchestratorAdmin,
  run: ResolutionRun,
  actor: string
): Promise<ResolutionRun | null> {
  if (run.status !== "paused" || !run.previous_status) return run;
  const switches = await readKillSwitches(admin, run.organization_id);
  if (switches.anyActive) return run;
  return transitionRun(admin, run, run.previous_status, { actor });
}

export async function processDueRuns(
  admin: OrchestratorAdmin,
  limit = 25
): Promise<{ processed: number; paused: number; escalated: number }> {
  const result = await admin
    .from("resolution_runs")
    .select("*")
    .not("status", "in", "(resolved,escalated,paused)")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (result.error) throw result.error;
  const summary = { processed: 0, paused: 0, escalated: 0 };
  for (const run of (result.data ?? []) as ResolutionRun[]) {
    summary.processed += 1;
    const switches = await readKillSwitches(admin, run.organization_id);
    if (switches.anyActive) {
      if (run.status !== "paused") {
        await pauseRun(admin, run, "orchestrator", "security.kill_switch");
        summary.paused += 1;
      }
      continue;
    }
    if (limitsExceeded(run)) {
      if (await escalateRun(admin, run, "limits_exceeded"))
        summary.escalated += 1;
      continue;
    }
    if (run.status === "queued") {
      await transitionRun(admin, run, "investigating", {
        actor: "orchestrator",
      });
      if (isEvidenceEngineEnabled()) {
        const evidence = await snapshotEvidence(
          admin,
          run.ticket_id,
          run.organization_id
        );
        await writeRunEvent(admin, {
          organization_id: run.organization_id,
          run_id: run.id,
          ticket_id: run.ticket_id,
          kind: "evidence.snapshot",
          actor: "orchestrator",
          detail: {
            hypotheses: evidence?.hypotheses.length ?? 0,
            topConfidence: evidence?.hypotheses[0]?.confidence ?? null,
            missingInformation: evidence?.missingInformation ?? [],
          },
        });
      }
      continue;
    }
    if (
      isPlannerEnabled() &&
      (run.status === "investigating" || run.status === "planning")
    ) {
      if (await planRun(admin, run)) {
        if (getPlannerMode() === "shadow") summary.escalated += 1;
      }
      continue;
    }
    if (
      isPlannerEnabled() &&
      (run.status === "awaiting_consent" || run.status === "awaiting_approval")
    ) {
      const resumed = await resumeAfterApproval(admin, run);
      if (resumed?.status === "escalated") summary.escalated += 1;
      continue;
    }
    if (isVerificationEngineEnabled() && run.status === "verifying") {
      const verified = await verifyRun(admin, run);
      if (verified?.status === "escalated") summary.escalated += 1;
      continue;
    }
    if (
      ["investigating", "planning", "policy_check", "failed"].includes(
        run.status
      )
    ) {
      const reason =
        run.status === "failed" ? "run_failed" : "planner_not_available";
      if (await escalateRun(admin, run, reason)) {
        summary.escalated += 1;
      }
    }
  }
  return summary;
}

export async function reapExpiredLeases(
  admin: OrchestratorAdmin
): Promise<{ reaped: number }> {
  const result = await admin
    .from("resolution_steps")
    .select("*")
    .eq("status", "running")
    .lt("lease_until", new Date().toISOString());
  if (result.error) throw result.error;
  let reaped = 0;
  for (const step of result.data ?? []) {
    const updated = await admin
      .from("resolution_steps")
      .update({
        status: "timed_out",
        finished_at: new Date().toISOString(),
      })
      .eq("id", step.id)
      .eq("organization_id", step.organization_id);
    if (updated.error) throw updated.error;
    const runResult = await admin
      .from("resolution_runs")
      .select("*")
      .eq("id", step.run_id)
      .eq("organization_id", step.organization_id)
      .maybeSingle();
    if (runResult.error) throw runResult.error;
    if (runResult.data) {
      const run = runResult.data as ResolutionRun;
      if (!isTerminal(run.status)) {
        const failed = await updateRun(admin, run, { status: "failed" });
        await writeRunEvent(admin, {
          organization_id: run.organization_id,
          run_id: run.id,
          ticket_id: run.ticket_id,
          kind: "step.lease_expired",
          actor: "reaper",
          from_status: run.status,
          to_status: "failed",
          detail: { stepId: step.id },
        });
        await escalateRun(admin, failed, "worker_lease_expired");
      }
    }
    reaped += 1;
  }
  return { reaped };
}

export { isAutonomyEnabled };
