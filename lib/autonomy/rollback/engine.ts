import { getAutonomyLimits } from "../config";
import { redactAuditDetail } from "../audit/redact";
import { auditVersions, initiatedBy } from "../audit/versions";
import { getCapability } from "../capabilities/registry";
import { escalateRun, transitionRun, writeRunEvent } from "../orchestrator";
import type { ResolutionRun } from "../orchestrator";
import { sanitizeOutput } from "../executor/sanitize";
import { getRollbackHandler } from "./handlers";
import type { RollbackAdmin } from "./types";

type ExecutionRow = {
  id: string;
  capability_id: string;
  capability_version: number;
  parameters: unknown;
};

function parametersFor(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function rollbackExecution(
  admin: RollbackAdmin,
  run: ResolutionRun,
  executionId: string,
  options: { actor?: string } = {}
): Promise<ResolutionRun | null> {
  if (run.status !== "verifying" && run.status !== "rolling_back") return run;
  const actor = options.actor ?? "orchestrator";
  const existing = await admin
    .from("rollback_runs")
    .select("id,status")
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .eq("execution_id", executionId)
    .limit(1)
    .maybeSingle();
  if (existing.data) return escalateRun(admin, run, "verification_failed");

  const rollingBack =
    run.status === "rolling_back"
      ? run
      : await transitionRun(admin, run, "rolling_back", { actor });
  if (!rollingBack) return null;

  const executionResult = await admin
    .from("capability_executions")
    .select("id,capability_id,capability_version,parameters")
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .eq("id", executionId)
    .maybeSingle();
  const execution = executionResult.data as ExecutionRow | null;
  const capability = execution
    ? getCapability(execution.capability_id, execution.capability_version)
    : null;
  const method = capability?.rollback ?? "none";
  const handler = capability
    ? getRollbackHandler(capability.id, capability.version)
    : null;
  if (
    executionResult.error ||
    !execution ||
    !capability ||
    method === "none" ||
    !handler
  ) {
    await admin.from("rollback_runs").insert({
      organization_id: run.organization_id,
      run_id: run.id,
      execution_id: executionId,
      method,
      status: "unsupported",
      result: {},
      initiated_by: initiatedBy(actor),
      versions: auditVersions(
        capability ? { id: capability.id, version: capability.version } : null
      ),
    });
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "rollback.unsupported",
      actor,
      detail: { method },
    });
    return escalateRun(admin, rollingBack, "verification_failed");
  }

  await writeRunEvent(admin, {
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind: "rollback.started",
    actor,
    detail: { executionId, method },
  });
  let result: {
    ok: boolean;
    output: Record<string, string | number | boolean | null>;
    error?: string;
  };
  try {
    result = await handler.run({
      admin,
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      runId: run.id,
      executionId,
      parameters: parametersFor(execution.parameters),
      signal: AbortSignal.timeout(
        capability.maxRuntimeMs || getAutonomyLimits().runtimeMs
      ),
    });
  } catch (error) {
    result = {
      ok: false,
      output: {},
      error: error instanceof Error ? error.message : "rollback failed",
    };
  }
  const status = result.ok ? "succeeded" : "failed";
  const output = redactAuditDetail(sanitizeOutput(result.output));
  await admin.from("rollback_runs").insert({
    organization_id: run.organization_id,
    run_id: run.id,
    execution_id: executionId,
    method,
    status,
    result: output,
    initiated_by: initiatedBy(actor),
    versions: auditVersions({ id: capability.id, version: capability.version }),
  });
  await writeRunEvent(admin, {
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind: `rollback.${status}`,
    actor,
    detail: { executionId, method, output, error: result.error ?? null },
  });
  return escalateRun(admin, rollingBack, "verification_failed");
}
