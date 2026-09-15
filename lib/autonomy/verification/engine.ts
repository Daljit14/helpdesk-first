import type { ResolutionRun } from "../orchestrator";
import { escalateRun, transitionRun, writeRunEvent } from "../orchestrator";
import { getAutonomyLimits } from "../config";
import { getCapability } from "../capabilities/registry";
import { isRollbackEnabled } from "../config";
import { redactAuditDetail } from "../audit/redact";
import { auditVersions, initiatedBy } from "../audit/versions";
import { rollbackExecution } from "../rollback";
import { getVerifier } from "./verifiers";
import type {
  VerificationOutcome,
  VerifierAdmin,
  VerifierEvidence,
  VerifierResult,
} from "./types";

type ExecutionRow = {
  id: string;
  capability_id: string;
  capability_version: number;
  parameters: unknown;
  status: string;
};

type VerificationRow = {
  id?: string;
  execution_id: string | null;
  method: string;
  evidence: VerifierEvidence;
  user_confirmed: boolean;
  outcome: VerificationOutcome;
  verifier_version: string | null;
};

type TicketRow = {
  status: string | null;
  verified_by_user: boolean;
  user_confirmed: boolean;
};

const RESOLVING_METHODS = new Set([
  "outbox_status_sent",
  "outbox_sent_and_user_confirms",
  "user_verification_answer",
]);

function parametersFor(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isResolvingMethod(method: string): boolean {
  return RESOLVING_METHODS.has(method);
}

async function insertVerificationResult(
  admin: VerifierAdmin,
  run: ResolutionRun,
  executionId: string | null,
  actor: string,
  result: {
    method: string;
    evidence: VerifierEvidence;
    userConfirmed?: boolean;
    outcome: VerificationOutcome;
    verifierVersion: string | null;
  }
): Promise<void> {
  await admin.from("verification_results").insert({
    organization_id: run.organization_id,
    run_id: run.id,
    execution_id: executionId,
    method: result.method,
    evidence: redactAuditDetail(result.evidence),
    user_confirmed: result.userConfirmed ?? false,
    outcome: result.outcome,
    verifier_version: result.verifierVersion,
    initiated_by: initiatedBy(actor),
    versions: auditVersions(),
  });
}

async function recordVerification(
  admin: VerifierAdmin,
  run: ResolutionRun,
  executionId: string | null,
  actor: string,
  result: {
    method: string;
    evidence: VerifierEvidence;
    userConfirmed?: boolean;
    outcome: VerificationOutcome;
    verifierVersion: string | null;
  }
): Promise<void> {
  await insertVerificationResult(admin, run, executionId, actor, result);
  await writeRunEvent(admin, {
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind: `verification.${result.outcome}`,
    actor,
    detail: {
      method: result.method,
      executionId,
      evidence: result.evidence,
    },
  });
}

async function readTicket(
  admin: VerifierAdmin,
  run: ResolutionRun
): Promise<TicketRow | null> {
  const result = await admin
    .from("tickets")
    .select("status,verified_by_user,user_confirmed")
    .eq("id", run.ticket_id)
    .eq("organization_id", run.organization_id)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return result.data as TicketRow;
}

async function hasVerificationRequest(
  admin: VerifierAdmin,
  run: ResolutionRun
): Promise<boolean> {
  const result = await admin
    .from("resolution_events")
    .select("id")
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .eq("kind", "verification.requested")
    .limit(1);
  return !result.error && (result.data ?? []).length > 0;
}

async function hasPassedVerification(
  admin: VerifierAdmin,
  run: ResolutionRun
): Promise<boolean> {
  const result = await admin
    .from("verification_results")
    .select("id")
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .eq("outcome", "passed")
    .limit(1);
  return !result.error && (result.data ?? []).length > 0;
}

async function resolveRun(
  admin: VerifierAdmin,
  run: ResolutionRun,
  actor: string,
  now: () => Date
): Promise<ResolutionRun | null> {
  if (!(await hasPassedVerification(admin, run))) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "verification.resolution_blocked",
      actor,
      detail: { reason: "passed_verification_missing" },
    });
    return run;
  }
  const ticket = await readTicket(admin, run);
  if (!ticket?.user_confirmed) {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "verification.resolution_blocked",
      actor,
      detail: { reason: "user_confirmation_missing" },
    });
    return run;
  }
  const resolved = await transitionRun(admin, run, "resolved", { actor });
  if (!resolved) return null;
  const resolvedAt = now().toISOString();
  const ticketUpdate = await admin
    .from("tickets")
    .update({
      status: "Resolved",
      resolution_source: "ai",
      resolver_type: "ai",
      resolved_at: resolvedAt,
    })
    .eq("id", run.ticket_id)
    .eq("organization_id", run.organization_id);
  if (ticketUpdate.error) return resolved;
  await writeRunEvent(admin, {
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind: "run.resolved",
    actor,
    to_status: "resolved",
    detail: { resolvedAt },
  });
  return resolved;
}

async function handleResolvingResult(
  admin: VerifierAdmin,
  run: ResolutionRun,
  executionId: string | null,
  method: string,
  verifierVersion: string | null,
  outcome: VerificationOutcome,
  evidence: VerifierEvidence,
  actor: string,
  now: () => Date
): Promise<ResolutionRun | null> {
  if (outcome === "inconclusive") return run;
  const ticket = await readTicket(admin, run);
  if (!ticket) return run;
  const requested = await hasVerificationRequest(admin, run);
  if (ticket.user_confirmed && ticket.verified_by_user) {
    await recordVerification(admin, run, executionId, actor, {
      method: "user_confirmation",
      evidence: { ticketStatus: ticket.status },
      userConfirmed: true,
      outcome: "passed",
      verifierVersion,
    });
    const verified = await transitionRun(admin, run, "verified", { actor });
    if (!verified) return null;
    return resolveRun(admin, verified, actor, now);
  }
  if (
    requested &&
    ["ai resolving", "needs human"].includes(ticket.status?.toLowerCase() ?? "")
  ) {
    await recordVerification(admin, run, executionId, actor, {
      method: "user_confirmation",
      evidence: { ticketStatus: ticket.status },
      outcome: "failed",
      verifierVersion,
    });
    return transitionRun(admin, run, "failed", {
      actor,
      detail: { method: "user_confirmation", evidence },
    });
  }
  if (ticket.status?.toLowerCase() === "pending verification") return run;
  const ticketUpdate = await admin
    .from("tickets")
    .update({
      status: "Pending Verification",
      verification_method: method,
    })
    .eq("id", run.ticket_id)
    .eq("organization_id", run.organization_id);
  if (ticketUpdate.error) return run;
  await writeRunEvent(admin, {
    organization_id: run.organization_id,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind: "verification.requested",
    actor,
    detail: { method },
  });
  return run;
}

async function handleInformationalResult(
  admin: VerifierAdmin,
  run: ResolutionRun,
  method: string,
  evidence: VerifierEvidence,
  outcome: VerificationOutcome,
  actor: string
): Promise<ResolutionRun | null> {
  if (outcome === "inconclusive") return run;
  const verified = await transitionRun(admin, run, "verified", {
    actor,
    detail: { method, evidence },
  });
  if (!verified) return null;
  if (verified.attempts < getAutonomyLimits().maxAttempts) {
    return transitionRun(admin, verified, "planning", { actor });
  }
  return escalateRun(admin, verified, "attempts_exhausted");
}

async function handleObjectiveFailure(
  admin: VerifierAdmin,
  run: ResolutionRun,
  executionId: string,
  capabilityRollback: string | null,
  method: string,
  evidence: VerifierEvidence,
  actor: string
): Promise<ResolutionRun | null> {
  if (
    isRollbackEnabled() &&
    capabilityRollback &&
    capabilityRollback !== "none"
  ) {
    const rollback = await rollbackExecution(admin, run, executionId, {
      actor,
    });
    return rollback;
  }
  if (capabilityRollback && capabilityRollback !== "none") {
    await writeRunEvent(admin, {
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      kind: "rollback.unsupported_in_5c",
      actor,
      detail: { rollback: capabilityRollback },
    });
  }
  return transitionRun(admin, run, "failed", {
    actor,
    detail: { method, evidence },
  });
}

export async function verifyRun(
  admin: VerifierAdmin,
  run: ResolutionRun,
  options: { actor?: string; now?: () => Date } = {}
): Promise<ResolutionRun | null> {
  if (run.status !== "verifying") return run;
  const actor = options.actor ?? "orchestrator";
  const now = options.now ?? (() => new Date());
  const executionResult = await admin
    .from("capability_executions")
    .select("id,capability_id,capability_version,parameters,status")
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const execution = executionResult.data as ExecutionRow | null;
  if (executionResult.error || !execution) {
    return escalateRun(admin, run, "no_execution_to_verify");
  }
  const capability = getCapability(
    execution.capability_id,
    execution.capability_version
  );
  const method = capability?.verification ?? "unknown";
  const existingResult = await admin
    .from("verification_results")
    .select(
      "id,execution_id,method,evidence,user_confirmed,outcome,verifier_version"
    )
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .eq("method", method)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = existingResult.data as VerificationRow | null;
  if (existing && existing.outcome !== "inconclusive") {
    if (existing.outcome === "failed") {
      return handleObjectiveFailure(
        admin,
        run,
        execution.id,
        capability?.rollback ?? null,
        method,
        existing.evidence,
        actor
      );
    }
    if (isResolvingMethod(method)) {
      return handleResolvingResult(
        admin,
        run,
        execution.id,
        method,
        existing.verifier_version,
        existing.outcome,
        existing.evidence,
        actor,
        now
      );
    }
    return handleInformationalResult(
      admin,
      run,
      method,
      existing.evidence,
      existing.outcome,
      actor
    );
  }
  const selectedVerifier = getVerifier(method);
  if (!capability || !selectedVerifier) {
    const unknown = {
      method,
      evidence: { reason: "unknown_verification_method" },
      outcome: "failed" as const,
      verifierVersion: null,
    };
    await recordVerification(admin, run, execution.id, actor, unknown);
    return handleObjectiveFailure(
      admin,
      run,
      execution.id,
      capability?.rollback ?? null,
      method,
      unknown.evidence,
      actor
    );
  }
  const verifier = selectedVerifier;
  let result: VerifierResult;
  try {
    result = await verifier.verify({
      admin,
      organizationId: run.organization_id,
      ticketId: run.ticket_id,
      runId: run.id,
      executionId: execution.id,
      parameters: parametersFor(execution.parameters),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    result = {
      outcome: "inconclusive",
      evidence: { reason: "verifier_error" },
      userConfirmationRequired: isResolvingMethod(method),
    };
  }
  await recordVerification(admin, run, execution.id, actor, {
    method,
    evidence: result.evidence,
    outcome: result.outcome,
    verifierVersion: verifier.version,
  });
  if (result.outcome === "failed") {
    return handleObjectiveFailure(
      admin,
      run,
      execution.id,
      capability.rollback,
      method,
      result.evidence,
      actor
    );
  }
  if (result.userConfirmationRequired) {
    return handleResolvingResult(
      admin,
      run,
      execution.id,
      method,
      verifier.version,
      result.outcome,
      result.evidence,
      actor,
      now
    );
  }
  return handleInformationalResult(
    admin,
    run,
    method,
    result.evidence,
    result.outcome,
    actor
  );
}
