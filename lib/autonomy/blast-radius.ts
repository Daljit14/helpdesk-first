import { alertSecurityEvent } from "./alerts";
import { auditVersions } from "./audit/versions";
import { redactAuditDetail } from "./audit/redact";
import {
  getBlastRadiusLimits,
  getAutonomyLimits,
  getHourlyExecutionLimits,
  isBlastRadiusEnabled,
  type BlastRadiusLimits,
} from "./config";
import { getDeviceAction } from "@/lib/device-agent/catalog";
import type { HandlerAdmin } from "./executor/handlers/types";
import { setKillSwitch } from "./kill-switches";
import type { ResolutionRun } from "./orchestrator";

export type { BlastRadiusLimits } from "./config";

export type BlastRadiusEvent = {
  executionId: string;
  capabilityId: string;
  organizationId: string;
  runId: string;
  at: number;
  failed: boolean;
};

export type BlastRadiusVerdict = {
  trip: boolean;
  scope: "capability" | "global";
  reason: string;
  capabilityIds: string[];
  affectedOrganizationIds: string[];
};

function noTrip(): BlastRadiusVerdict {
  return {
    trip: false,
    scope: "capability",
    reason: "",
    capabilityIds: [],
    affectedOrganizationIds: [],
  };
}

export function evaluateBlastRadius(
  events: BlastRadiusEvent[],
  now: number,
  limits: BlastRadiusLimits,
  alreadyTrippedCapabilityIds: string[] = []
): BlastRadiusVerdict {
  const cutoff = now - limits.windowMs;
  const executions = new Map<string, BlastRadiusEvent>();
  for (const event of events) {
    if (event.at < cutoff || event.at > now) continue;
    const previous = executions.get(event.executionId);
    if (previous) {
      previous.failed ||= event.failed;
    } else {
      executions.set(event.executionId, { ...event });
    }
  }
  const grouped = new Map<string, BlastRadiusEvent[]>();
  for (const event of executions.values()) {
    const group = grouped.get(event.capabilityId) ?? [];
    group.push(event);
    grouped.set(event.capabilityId, group);
  }
  const tripped = [...grouped.entries()]
    .filter(([, group]) => {
      const failures = group.filter((event) => event.failed).length;
      const rate = failures / group.length;
      return (
        failures >= limits.failures ||
        (group.length >= limits.minRuns && rate >= limits.failureRate)
      );
    })
    .map(([capabilityId]) => capabilityId)
    .sort();
  const allTripped = [
    ...new Set([...alreadyTrippedCapabilityIds, ...tripped]),
  ].sort();
  const scope = allTripped.length >= 2 ? "global" : "capability";
  const capabilityIds = scope === "global" ? allTripped : tripped;
  if (capabilityIds.length === 0) return noTrip();
  const affectedOrganizationIds = [
    ...new Set(
      [...executions.values()]
        .filter(
          (event) => event.failed && capabilityIds.includes(event.capabilityId)
        )
        .map((event) => event.organizationId)
    ),
  ].sort();
  const reason =
    scope === "global"
      ? `global:${capabilityIds.join(",")}`
      : (() => {
          const group = grouped.get(capabilityIds[0]) ?? [];
          const failures = group.filter((event) => event.failed).length;
          return `capability:${capabilityIds[0]}:failures=${failures}/${group.length}`;
        })();
  return {
    trip: true,
    scope,
    reason,
    capabilityIds,
    affectedOrganizationIds,
  };
}

type SwitchRow = {
  scope: "global" | "capability";
  scope_id: string | null;
  enabled: boolean;
  reason: string | null;
  set_at: string | null;
};

type OutcomeOptions = {
  enabled?: boolean;
  limits?: BlastRadiusLimits;
  now?: Date;
};

function automaticReason(reason: unknown): reason is string {
  return typeof reason === "string" && reason.startsWith("blast_radius:");
}

function clearedAt(row: SwitchRow | null): number | null {
  if (
    !row ||
    row.enabled ||
    (!automaticReason(row.reason) && row.reason !== "blast_radius_cleared") ||
    !row.set_at
  )
    return null;
  const value = new Date(row.set_at).getTime();
  return Number.isFinite(value) ? value : null;
}

async function readSwitch(
  admin: HandlerAdmin,
  scope: "global" | "capability",
  scopeId: string | null
): Promise<SwitchRow | null> {
  let query = admin
    .from("ai_kill_switches")
    .select("scope,scope_id,enabled,reason,set_at")
    .eq("scope", scope);
  query =
    scopeId === null
      ? query.is("scope_id", null)
      : query.eq("scope_id", scopeId);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return !result.data ? null : (result.data as SwitchRow);
}

export async function recordBlastRadiusOutcome(
  admin: HandlerAdmin,
  input: {
    run: ResolutionRun;
    capabilityId?: string;
    executionId?: string;
  },
  options: OutcomeOptions = {}
): Promise<BlastRadiusVerdict | null> {
  if (!(options.enabled ?? isBlastRadiusEnabled())) return null;
  try {
    const now = options.now ?? new Date();
    const limits = options.limits ?? getBlastRadiusLimits();
    let capabilityId = input.capabilityId;
    if (!capabilityId && input.executionId) {
      const execution = await admin
        .from("capability_executions")
        .select("capability_id")
        .eq("id", input.executionId)
        .eq("organization_id", input.run.organization_id)
        .maybeSingle();
      if (execution.error || typeof execution.data?.capability_id !== "string")
        return null;
      capabilityId = execution.data.capability_id;
    }
    if (!capabilityId) return null;

    const baseStart = now.getTime() - limits.windowMs;
    const runtimeStart = now.getTime() - getAutonomyLimits().runtimeMs;
    const [
      globalSwitch,
      capabilitySwitch,
      capabilitySwitches,
      clearedSwitches,
    ] = await Promise.all([
      readSwitch(admin, "global", null),
      readSwitch(admin, "capability", capabilityId),
      admin
        .from("ai_kill_switches")
        .select("scope,scope_id,enabled,reason,set_at")
        .eq("scope", "capability")
        .eq("enabled", true)
        .limit(1_000),
      admin
        .from("ai_kill_switches")
        .select("scope,scope_id,enabled,reason,set_at")
        .eq("scope", "capability")
        .eq("enabled", false)
        .gte("set_at", new Date(baseStart).toISOString())
        .limit(1_000),
    ]);
    if (capabilitySwitches.error || clearedSwitches.error) return null;
    const globalStart = Math.max(
      baseStart,
      clearedAt(globalSwitch) ?? baseStart
    );
    const capabilityStart = Math.max(
      baseStart,
      clearedAt(capabilitySwitch) ?? baseStart
    );
    const alreadyTrippedCapabilityIds = (
      (capabilitySwitches.data ?? []) as SwitchRow[]
    )
      .filter(
        (row) =>
          automaticReason(row.reason) &&
          row.scope_id &&
          new Date(row.set_at ?? 0).getTime() >= baseStart
      )
      .map((row) => row.scope_id as string);
    const executionsResult = await admin
      .from("capability_executions")
      .select(
        "id,organization_id,run_id,status,created_at,capability_id,duration_ms"
      )
      .eq("capability_id", capabilityId)
      .gte("created_at", new Date(baseStart).toISOString())
      .order("created_at", { ascending: true })
      .limit(1_000);
    if (executionsResult.error) return null;
    const executions = [
      ...((executionsResult.data ?? []) as {
        id: string;
        organization_id: string;
        run_id: string;
        status: string;
        created_at: string;
        capability_id: string;
        duration_ms: number | null;
      }[]),
    ];
    const priorCapabilityIds = alreadyTrippedCapabilityIds.filter(
      (id) => id !== capabilityId
    );
    if (priorCapabilityIds.length > 0) {
      const priorExecutions = await admin
        .from("capability_executions")
        .select(
          "id,organization_id,run_id,status,created_at,capability_id,duration_ms"
        )
        .in("capability_id", priorCapabilityIds)
        .gte("created_at", new Date(baseStart).toISOString())
        .order("created_at", { ascending: true })
        .limit(1_000);
      if (priorExecutions.error) return null;
      const seen = new Set(executions.map((execution) => execution.id));
      for (const execution of (priorExecutions.data ??
        []) as typeof executions) {
        if (!seen.has(execution.id)) executions.push(execution);
      }
    }
    const executionIds = executions.map((execution) => execution.id);
    const [verificationResult, rollbackResult] =
      executionIds.length === 0
        ? [
            { data: [], error: null },
            { data: [], error: null },
          ]
        : await Promise.all([
            admin
              .from("verification_results")
              .select("execution_id")
              .eq("outcome", "failed")
              .in("execution_id", executionIds),
            admin
              .from("rollback_runs")
              .select("execution_id")
              .in("execution_id", executionIds),
          ]);
    if (verificationResult.error || rollbackResult.error) return null;
    const failedVerificationIds = new Set(
      ((verificationResult.data ?? []) as { execution_id: string | null }[])
        .map((row) => row.execution_id)
        .filter((id): id is string => Boolean(id))
    );
    const rollbackIds = new Set(
      ((rollbackResult.data ?? []) as { execution_id: string | null }[])
        .map((row) => row.execution_id)
        .filter((id): id is string => Boolean(id))
    );
    const clearedCapabilityCutoffs = new Map<string, number>();
    for (const row of (clearedSwitches.data ?? []) as SwitchRow[]) {
      const cutoff = clearedAt(row);
      if (!row.scope_id || cutoff === null) continue;
      clearedCapabilityCutoffs.set(
        row.scope_id,
        Math.max(
          clearedCapabilityCutoffs.get(row.scope_id) ?? baseStart,
          cutoff
        )
      );
    }
    const events = executions
      .filter((execution) => {
        const at = new Date(execution.created_at).getTime();
        if (
          execution.status === "failed" &&
          execution.duration_ms === null &&
          at > runtimeStart
        )
          return false;
        const cutoff = Math.max(
          globalStart,
          Math.max(
            baseStart,
            execution.capability_id === capabilityId
              ? capabilityStart
              : baseStart,
            clearedCapabilityCutoffs.get(execution.capability_id) ?? baseStart
          )
        );
        return at >= cutoff && at <= now.getTime();
      })
      .map((execution) => ({
        executionId: execution.id,
        capabilityId: execution.capability_id,
        organizationId: execution.organization_id,
        runId: execution.run_id,
        at: new Date(execution.created_at).getTime(),
        failed:
          execution.status !== "succeeded" ||
          failedVerificationIds.has(execution.id) ||
          rollbackIds.has(execution.id),
      }));
    const verdict = evaluateBlastRadius(
      events,
      now.getTime(),
      limits,
      alreadyTrippedCapabilityIds
    );
    if (!verdict.trip) return verdict;
    const globalTrip = verdict.scope === "global";
    if (
      (globalTrip && globalSwitch?.enabled) ||
      (!globalTrip && capabilitySwitch?.enabled)
    )
      return verdict;

    const reason = `blast_radius:${verdict.reason}`.slice(0, 200);
    const setBy = "system";
    if (!capabilitySwitch?.enabled) {
      const capabilitySet = await setKillSwitch(admin, {
        scope: "capability",
        scopeId: capabilityId,
        enabled: true,
        reason,
        setBy,
        organizationId: null,
      });
      if (!capabilitySet.ok) return null;
    }
    if (globalTrip && !globalSwitch?.enabled) {
      const globalSet = await setKillSwitch(admin, {
        scope: "global",
        scopeId: null,
        enabled: true,
        reason,
        setBy,
        organizationId: null,
      });
      if (!globalSet.ok) return null;
    }
    await admin.from("resolution_events").insert({
      organization_id: input.run.organization_id,
      run_id: input.run.id,
      ticket_id: input.run.ticket_id,
      kind: "blast_radius.tripped",
      actor: "orchestrator",
      initiated_by: "ai",
      versions: auditVersions(),
      detail: redactAuditDetail({
        scope: verdict.scope,
        capabilityIds: verdict.capabilityIds,
        affectedOrganizationIds: verdict.affectedOrganizationIds,
        reason: verdict.reason,
      }),
    });
    const affected = verdict.affectedOrganizationIds;
    for (const organizationId of affected) {
      let runId = input.run.id;
      let ticketId = input.run.ticket_id;
      if (organizationId !== input.run.organization_id) {
        const candidate = [...events]
          .filter(
            (event) => event.organizationId === organizationId && event.failed
          )
          .sort((left, right) => right.at - left.at)[0];
        if (!candidate) continue;
        const runResult = await admin
          .from("resolution_runs")
          .select("ticket_id")
          .eq("id", candidate.runId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (runResult.error || typeof runResult.data?.ticket_id !== "string")
          continue;
        runId = candidate.runId;
        ticketId = runResult.data.ticket_id;
      }
      await alertSecurityEvent(admin, {
        organizationId,
        ticketId,
        runId,
        kind: "blast_radius_tripped",
        detail: {
          scope: verdict.scope,
          reason: verdict.reason,
        },
      });
    }
    return verdict;
  } catch {
    return null;
  }
}

export type HourlyExecutionLimits = ReturnType<typeof getHourlyExecutionLimits>;

export async function checkHourlyLimits(
  admin: HandlerAdmin,
  input: {
    organizationId: string;
    capabilityId: string;
    capabilityVersion: number;
  },
  limits: HourlyExecutionLimits = getHourlyExecutionLimits(),
  now = new Date()
): Promise<
  | { ok: true }
  | {
      ok: false;
      code: "blast_radius_limit";
      scope: "organization" | "capability_devices";
    }
> {
  if (limits.orgHourly === null && limits.capabilityDevicesPerHour === null)
    return { ok: true };
  try {
    const since = new Date(now.getTime() - 60 * 60_000).toISOString();
    if (limits.orgHourly !== null) {
      const executions = await admin
        .from("capability_executions")
        .select("id")
        .eq("organization_id", input.organizationId)
        .gte("created_at", since)
        .limit(limits.orgHourly);
      if (executions.error)
        return { ok: false, code: "blast_radius_limit", scope: "organization" };
      if ((executions.data ?? []).length >= limits.orgHourly)
        return { ok: false, code: "blast_radius_limit", scope: "organization" };
    }
    if (limits.capabilityDevicesPerHour !== null) {
      const action = getDeviceAction(
        input.capabilityId,
        input.capabilityVersion
      );
      if (action) {
        const jobs = await admin
          .from("device_jobs")
          .select("device_id")
          .eq("action_id", action.id)
          .eq("kind", "action")
          .eq("mode", "execute")
          .gte("created_at", since)
          .limit(1_000);
        if (jobs.error)
          return {
            ok: false,
            code: "blast_radius_limit",
            scope: "organization",
          };
        const devices = new Set(
          ((jobs.data ?? []) as { device_id: string }[]).map(
            (row) => row.device_id
          )
        );
        if (devices.size >= limits.capabilityDevicesPerHour)
          return {
            ok: false,
            code: "blast_radius_limit",
            scope: "capability_devices",
          };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "blast_radius_limit", scope: "organization" };
  }
}
