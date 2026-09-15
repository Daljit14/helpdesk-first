import { isEscalationPackageEnabled } from "@/lib/investigation/config";
import { snapshotEscalationPackage } from "@/lib/investigation/escalation";
import { isEvidenceEngineEnabled } from "@/lib/admin/flags";
import { snapshotEvidence } from "@/lib/evidence/snapshot";
import { createAdminClient } from "@/lib/supabase/admin";
import { event } from "@/lib/tickets/events";
import { assertTransition, isTerminal, type RunStatus } from "./state-machine";
import {
  getAutonomyLimits,
  getPlannerMode,
  isAutonomyEnabled,
  isPlannerEnabled,
} from "./config";
import { readKillSwitches } from "./kill-switches";
import { listEnabledCapabilities } from "./capabilities/enablement";
import { getCapability, inputSchemaJson } from "./capabilities/registry";
import { executePlan } from "./executor/execute";
import { resumeAfterApproval } from "./executor/resume";
import { parsePlannerOutput } from "./planner/schema";
import { selectPlanner } from "./planner/select";

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

async function writeRunEvent(
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
    detail: input.detail ?? {},
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
  const planning = await transitionRun(admin, run, "planning", {
    actor: "orchestrator",
  });
  if (!planning) return null;
  const ticketResult = await admin
    .from("tickets")
    .select("id,category,platform,diagnostic_answers")
    .eq("id", run.ticket_id)
    .eq("organization_id", run.organization_id)
    .maybeSingle();
  if (ticketResult.error || !ticketResult.data) {
    return escalateRun(admin, planning, "ticket_not_found");
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
  const evidence = isEvidenceEngineEnabled()
    ? await snapshotEvidence(admin, run.ticket_id, run.organization_id)
    : null;
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
          },
        ]
      : [];
  });
  const planner = selectPlanner();
  let raw: unknown;
  try {
    raw = await planner.plan(
      {
        evidence,
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
    return escalateRun(admin, planning, "provider_unavailable");
  }
  const parsed = parsePlannerOutput(raw);
  if (!parsed.ok) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "plan.rejected",
      actor: "orchestrator",
      detail: { issues: parsed.issues },
    });
    return escalateRun(admin, planning, "plan_rejected");
  }
  const planStep = await admin
    .from("resolution_steps")
    .insert({
      organization_id: run.organization_id,
      run_id: run.id,
      kind: "plan",
      position: 0,
      status: "done",
      detail: {
        plan: parsed.value,
        planner: planner.id,
        plannerVersion: planner.version,
      },
    })
    .select("id")
    .single();
  if (planStep.error || !planStep.data) {
    return escalateRun(admin, planning, "plan_persistence_failed");
  }
  if (getPlannerMode() === "shadow") {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "plan.shadow",
      actor: "orchestrator",
      detail: { plan: parsed.value },
    });
    const capabilityId =
      "capabilityId" in parsed.value ? parsed.value.capabilityId : "planner";
    const capabilityVersion =
      "capabilityVersion" in parsed.value ? parsed.value.capabilityVersion : 1;
    await admin.from("policy_decisions").insert({
      organization_id: run.organization_id,
      run_id: run.id,
      step_id: planStep.data.id,
      capability_id: capabilityId,
      capability_version: capabilityVersion,
      decision: "deny",
      reasons: ["shadow_mode"],
      input: { shadow: true, plan: parsed.value },
      policy_version: "shadow",
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
): Promise<{ run: ResolutionRun; created: boolean }> {
  const limits = getAutonomyLimits();
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
    if (isPlannerEnabled() && run.status === "investigating") {
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
