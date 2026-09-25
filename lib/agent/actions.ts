import { createHash } from "node:crypto";
import { createWorkflowTicket } from "@/app/actions/tickets";
import { consumeAiConsent } from "@/app/actions/resolution";
import { alertSecurityEvent } from "@/lib/autonomy/alerts";
import { getCapability } from "@/lib/autonomy/capabilities/registry";
import { isDenylisted } from "./denylist";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import {
  getRequesterAgentBudgets,
  getRequesterAgentMaxFailedHypotheses,
  getRequesterAgentUserDailyActionCap,
} from "./budgets";
import {
  startRun,
  transitionRun,
  resolutionStepPosition,
  type ResolutionRun,
} from "@/lib/autonomy/orchestrator";
import { getPlannerProvider } from "@/lib/autonomy/config";
import { executePlan } from "@/lib/autonomy/executor/execute";
import { resumeAfterApproval } from "@/lib/autonomy/executor/resume";
import { verifyRun } from "@/lib/autonomy/verification/engine";
import type { AgentEvent, AgentSession, ConsentCard } from "./types";
import { writeStep, updateSession, escalate } from "./session";

type Admin = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

export type ProposeActionInput = {
  capabilityId: string;
  params: Record<string, unknown>;
  hypothesisId: string;
  rationale: string;
};

export type ProposeOutcome =
  | { kind: "consent_required"; approvalRequestId: string; card: ConsentCard }
  | {
      kind: "rejected";
      code:
        | "unknown_capability"
        | "denylisted"
        | "research_only_evidence"
        | "unknown_hypothesis"
        | "target_field"
        | "loop_detected"
        | "action_budget"
        | "user_daily_cap"
        | "kill_switch"
        | "policy_denied"
        | "specialist_only"
        | "read_only_capability";
      message: string;
    }
  | { kind: "escalate"; reason: string };

function hashParams(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasTargetKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    [
      "user_id",
      "userId",
      "device_id",
      "deviceId",
      "org_id",
      "organizationId",
      "directoryUserId",
      "email",
    ].includes(key)
      ? true
      : hasTargetKey(child)
  );
}

type RejectionCode = Extract<ProposeOutcome, { kind: "rejected" }>["code"];

function reject(code: RejectionCode, message: string): ProposeOutcome {
  return { kind: "rejected", code, message };
}

async function actionStep(
  admin: Admin,
  session: AgentSession,
  kind: string,
  capabilityId: string,
  paramsHash: string,
  detail: string
) {
  await writeStep(admin, session, {
    kind,
    toolName: "propose_action",
    capabilityId,
    paramsHash,
    resultSummary: `${capabilityId} ${detail}`.slice(0, 500),
  });
}

async function ensureBackingRun(
  admin: Admin,
  session: AgentSession,
  platform?: string
): Promise<ResolutionRun | null> {
  let ticketId = session.backing_ticket_id;
  if (!ticketId) {
    const created = await createWorkflowTicket({
      message: (session.last_user_message ?? "Requester support request").slice(
        0,
        2000
      ),
      platform: platform ?? "Other",
      diagnosticAnswers: [],
      source: "requester_agent",
      skipTriage: true,
    });
    if (!("ticketId" in created) || !created.ticketId) return null;
    ticketId = created.ticketId;
    await admin
      .from("tickets")
      .update({
        status: "AI Resolving",
        ai_attempted: true,
        ai_attempted_at: new Date().toISOString(),
      })
      .eq("id", ticketId)
      .eq("organization_id", session.organization_id);
    await updateSession(admin, session, { backing_ticket_id: ticketId });
    session.backing_ticket_id = ticketId;
  }
  const started = await startRun(admin, {
    ticketId,
    organizationId: session.organization_id,
    initiatedBy: `requester_agent:${session.id}`,
  });
  if ("error" in started) return null;
  let run = started.run;
  if (run.status === "queued") {
    const transitioned = await transitionRun(admin, run, "planning", {
      actor: `requester_agent:${session.id}`,
    });
    if (!transitioned) return null;
    run = transitioned;
  }
  await updateSession(admin, session, { resolution_run_id: run.id });
  session.resolution_run_id = run.id;
  return run;
}

async function approvalCard(
  admin: Admin,
  session: AgentSession,
  approvalRequestId: string,
  capabilityId: string,
  expiresAt: string
): Promise<ConsentCard> {
  const capability = getCapability(capabilityId, 1);
  const ticket = await admin
    .from("tickets")
    .select("platform,user_id")
    .eq("id", session.backing_ticket_id)
    .eq("organization_id", session.organization_id)
    .maybeSingle();
  const device = await admin
    .from("devices_public")
    .select("hostname")
    .eq("organization_id", session.organization_id)
    .eq("user_id", ticket.data?.user_id)
    .limit(1)
    .maybeSingle();
  const isDevice = capabilityId.startsWith("device_");
  return {
    approvalRequestId,
    capabilityId,
    title: capability?.description ?? capabilityId,
    whatHappens: capability?.description ?? "A support action will run.",
    target: isDevice
      ? { kind: "device", label: device.data?.hostname ?? "your device" }
      : { kind: "account", label: "your account" },
    reversible: capability?.rollback !== "none",
    expiresAt,
  };
}

export async function proposeAction(
  admin: Admin,
  session: AgentSession,
  input: ProposeActionInput,
  ctx: {
    evidence: Array<{ id: string; tool: string }>;
    actor: string;
    platform?: string;
  }
): Promise<ProposeOutcome> {
  const paramsHash = hashParams(input.params);
  const switches = await readKillSwitches(
    admin,
    session.organization_id,
    input.capabilityId
  );
  if (switches.anyActive)
    return reject("kill_switch", "Actions are paused for safety.");
  if (hasTargetKey(input.params))
    return reject(
      "target_field",
      "That action contains a prohibited target field."
    );
  const capability = getCapability(input.capabilityId, 1);
  if (!capability)
    return reject("unknown_capability", "That action is not available.");
  if (isDenylisted(input.capabilityId, capability)) {
    await actionStep(
      admin,
      session,
      "security_incident",
      input.capabilityId,
      paramsHash,
      "denylisted"
    );
    await updateSession(admin, session, {
      security_flag: true,
      halt_reason: "denylisted",
    });
    await alertSecurityEvent(admin, {
      organizationId: session.organization_id,
      ticketId: session.backing_ticket_id ?? "",
      runId: session.resolution_run_id ?? null,
      kind: "requester_agent_denylisted_action",
      detail: { capabilityId: input.capabilityId },
    });
    return { kind: "escalate", reason: "denylisted" };
  }
  if (capability.sideEffects === "read_only")
    return reject(
      "read_only_capability",
      "Read-only capabilities cannot be proposed as actions."
    );
  const evidence = ctx.evidence.find((item) => item.id === input.hypothesisId);
  if (!evidence)
    return reject(
      "unknown_hypothesis",
      "That evidence is not available in this session."
    );
  if (
    evidence.tool === "search_guides" ||
    evidence.tool === "get_ticket_history"
  )
    return reject(
      "research_only_evidence",
      "Research evidence cannot authorize an action."
    );
  const existing = await admin
    .from("agent_steps")
    .select("capability_id,params_hash")
    .eq("session_id", session.id)
    .eq("capability_id", input.capabilityId)
    .eq("params_hash", paramsHash);
  if ((existing.data ?? []).length > 0)
    return { kind: "escalate", reason: "loop_detected" };
  const limits = getRequesterAgentBudgets();
  if (session.action_count >= limits.maxActions)
    return reject("action_budget", "The action budget has been reached.");
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const requesterSessions = await admin
    .from("agent_sessions")
    .select("id")
    .eq("organization_id", session.organization_id)
    .eq("requester_id", session.requester_id);
  const sessionIds = (requesterSessions.data ?? []).map((row) => row.id);
  const daily =
    sessionIds.length === 0
      ? { data: [] as Array<{ id: string }> }
      : await admin
          .from("agent_steps")
          .select("id")
          .in("session_id", sessionIds)
          .eq("kind", "action_executing")
          .gte("created_at", start.toISOString());
  if ((daily.data ?? []).length >= getRequesterAgentUserDailyActionCap())
    return reject("user_daily_cap", "The daily action limit has been reached.");
  const run = await ensureBackingRun(admin, session, ctx.platform);
  if (!run || !run.ticket_id)
    return { kind: "escalate", reason: "backing_run_unavailable" };
  const plan = {
    ticketId: run.ticket_id,
    diagnosis: {
      summary: `Evidence ${input.hypothesisId}: ${input.rationale}`.slice(
        0,
        300
      ),
      confidence: 0.9,
      evidenceIds: ["ticket"],
    },
    decision: "propose_action" as const,
    capability: {
      id: capability.id,
      version: capability.version,
      parameters: input.params as Record<
        string,
        string | number | boolean | null
      >,
    },
    verificationMethod: capability.verification,
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
        plan,
        planner: "requester_agent",
        plannerVersion: 1,
        plannerProvider: getPlannerProvider(),
      },
    })
    .select("id")
    .single();
  if (planStep.error || !planStep.data?.id)
    return { kind: "escalate", reason: "plan_persistence_failed" };
  await actionStep(
    admin,
    session,
    "action_proposed",
    input.capabilityId,
    paramsHash,
    input.rationale
  );
  const result = await executePlan(admin, run, plan, {
    actor: ctx.actor,
    stepId: planStep.data.id,
    forceUserConsent: true,
    consentTtlMs: 300_000,
    verify: async ({ admin: executionAdmin, run: executionRun }) => {
      await verifyRun(executionAdmin, executionRun);
      return { outcome: "pending" };
    },
  });
  if (!result) return { kind: "escalate", reason: "execution_unavailable" };
  if (result.status === "awaiting_consent") {
    const approval = await admin
      .from("approval_requests")
      .select("id,run_id,step_id,capability_id,parameter_hash,expires_at")
      .eq("run_id", run.id)
      .eq("organization_id", session.organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!approval.data?.id)
      return { kind: "escalate", reason: "consent_missing" };
    await updateSession(admin, session, {
      pending_approval_id: approval.data.id,
    });
    session.pending_approval_id = approval.data.id;
    await actionStep(
      admin,
      session,
      "consent_required",
      input.capabilityId,
      paramsHash,
      approval.data.id
    );
    return {
      kind: "consent_required",
      approvalRequestId: approval.data.id,
      card: await approvalCard(
        admin,
        session,
        approval.data.id,
        input.capabilityId,
        approval.data.expires_at ?? new Date(Date.now() + 300_000).toISOString()
      ),
    };
  }
  if (result.status === "escalated") {
    if (result.escalation_reason === "policy_denied")
      return reject("policy_denied", "Organization policy denied this action.");
    if (result.escalation_reason === "specialist_only")
      return reject("specialist_only", "This action requires a specialist.");
    return {
      kind: "escalate",
      reason: result.escalation_reason ?? "policy_denied",
    };
  }
  return { kind: "escalate", reason: "action_not_awaiting_consent" };
}

export async function decideConsent(
  admin: Admin,
  session: AgentSession,
  input: {
    approvalRequestId: string;
    decision: "approve" | "decline";
    userId: string;
  },
  emit: (event: AgentEvent) => void,
  signal: AbortSignal
): Promise<
  | "executed_verified_passed"
  | "executed_verified_failed"
  | "declined"
  | "invalid"
  | "escalated"
> {
  if (
    !session.resolution_run_id ||
    session.pending_approval_id !== input.approvalRequestId
  )
    return "invalid";
  const approval = await admin
    .from("approval_requests")
    .select("id,run_id,step_id,capability_id,parameter_hash,status,expires_at")
    .eq("id", input.approvalRequestId)
    .eq("organization_id", session.organization_id)
    .eq("ticket_id", session.backing_ticket_id)
    .maybeSingle();
  if (
    approval.error ||
    !approval.data ||
    approval.data.run_id !== session.resolution_run_id
  )
    return "invalid";
  const runResult = await admin
    .from("resolution_runs")
    .select("*")
    .eq("id", session.resolution_run_id)
    .eq("organization_id", session.organization_id)
    .maybeSingle();
  if (!runResult.data || runResult.data.status !== "awaiting_consent")
    return "invalid";
  const consumed = await consumeAiConsent(
    admin,
    input.approvalRequestId,
    input.userId,
    input.decision === "approve" ? "grant" : "deny"
  );
  if (!consumed.ok) return "invalid";
  if (
    consumed.request.run_id !== session.resolution_run_id ||
    consumed.request.id !== approval.data.id
  )
    return "invalid";
  const run = runResult.data as ResolutionRun;
  const capabilityId = approval.data.capability_id ?? "requested_action";
  const paramsHash = approval.data.parameter_hash ?? "";
  await writeStep(admin, session, {
    kind: "consent_decided",
    capabilityId,
    paramsHash,
    consentId: approval.data.id,
    resultSummary: input.decision,
  });
  await updateSession(admin, session, { pending_approval_id: null });
  session.pending_approval_id = null;
  if (input.decision === "decline") {
    await resumeAfterApproval(admin, run, { actor: input.userId });
    await writeStep(admin, session, {
      kind: "consent_declined",
      capabilityId,
      paramsHash,
      consentId: approval.data.id,
      resultSummary: "Consent declined",
    });
    emit({ type: "consent_declined", capabilityId });
    return "declined";
  }
  emit({
    type: "action_executing",
    capabilityId,
    text: "Running the approved action…",
  });
  const actionCount = (session.action_count ?? 0) + 1;
  await updateSession(admin, session, { action_count: actionCount });
  session.action_count = actionCount;
  await writeStep(admin, session, {
    kind: "action_executing",
    capabilityId,
    paramsHash,
    consentId: approval.data.id,
    resultSummary: "Action executing",
  });
  const resumed = await resumeAfterApproval(admin, run, {
    actor: `requester_agent:${session.id}`,
    consent: { type: "user_consent", userId: input.userId },
  });
  if (!resumed || resumed.status === "escalated") {
    const reason = resumed?.escalation_reason ?? "execution_denied";
    const ticketId = await escalate(
      admin,
      session,
      reason,
      "The approved action could not be executed."
    );
    emit({ type: "escalated", ticketId, reason });
    return "escalated";
  }
  const deadline =
    Date.now() +
    (Number(process.env.HELP_DESK_REQUESTER_AGENT_VERIFY_TIMEOUT_MS) || 90_000);
  let current = resumed;
  while (!signal.aborted && Date.now() < deadline) {
    const checked = await verifyRun(admin, current);
    current = checked ?? current;
    const row = await admin
      .from("verification_results")
      .select("outcome,execution_id")
      .eq("run_id", current.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row.data?.outcome === "passed") {
      await updateSession(admin, session, {
        verified_execution_id: row.data.execution_id,
      });
      session.verified_execution_id = row.data.execution_id;
      await writeStep(admin, session, {
        kind: "verification_result",
        capabilityId,
        paramsHash,
        consentId: approval.data.id,
        resultSummary: "passed",
      });
      emit({
        type: "verification_result",
        status: "passed",
        rollback: "none",
        text: "The verification check passed.",
      });
      emit({ type: "confirm_required", text: "Is it working now?" });
      await writeStep(admin, session, {
        kind: "confirm_required",
        resultSummary: "Is it working now?",
      });
      return "executed_verified_passed";
    }
    if (row.data?.outcome === "failed") {
      const rollback = await admin
        .from("rollback_runs")
        .select("status")
        .eq("organization_id", session.organization_id)
        .eq("run_id", current.id)
        .eq("execution_id", row.data.execution_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const rollbackStatus =
        rollback.data?.status === "succeeded" ||
        rollback.data?.status === "failed" ||
        rollback.data?.status === "unsupported"
          ? rollback.data.status
          : "none";
      await writeStep(admin, session, {
        kind: "verification_result",
        capabilityId,
        paramsHash,
        consentId: approval.data.id,
        resultSummary: "failed",
      });
      await writeStep(admin, session, {
        kind: "rollback_result",
        capabilityId,
        paramsHash,
        consentId: approval.data.id,
        resultSummary: rollbackStatus,
      });
      if (rollbackStatus === "failed") {
        await alertSecurityEvent(admin, {
          organizationId: session.organization_id,
          ticketId: session.backing_ticket_id ?? "",
          runId: current.id,
          kind: "requester_agent_rollback_failed",
          detail: { capabilityId, executionId: row.data.execution_id },
        });
        const ticketId = await escalate(
          admin,
          session,
          "rollback_failed",
          "The attempted rollback failed."
        );
        emit({ type: "escalated", ticketId, reason: "rollback_failed" });
        return "escalated";
      }
      const failedHypotheses = (session.failed_hypotheses ?? 0) + 1;
      await updateSession(admin, session, {
        failed_hypotheses: failedHypotheses,
      });
      session.failed_hypotheses = failedHypotheses;
      emit({
        type: "verification_result",
        status: "failed",
        rollback: rollbackStatus,
        text: "The verification check failed.",
      });
      if (failedHypotheses >= getRequesterAgentMaxFailedHypotheses()) {
        const ticketId = await escalate(
          admin,
          session,
          "hypotheses_exhausted",
          "The available fixes did not resolve the issue."
        );
        emit({ type: "escalated", ticketId, reason: "hypotheses_exhausted" });
        return "escalated";
      }
      return "executed_verified_failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  await writeStep(admin, session, {
    kind: "verification_result",
    capabilityId,
    paramsHash,
    consentId: approval.data.id,
    resultSummary: "inconclusive",
  });
  emit({
    type: "verification_result",
    status: "inconclusive",
    rollback: "none",
    text: "The verification check did not complete.",
  });
  const ticketId = await escalate(
    admin,
    session,
    "verification_inconclusive",
    "Verification did not complete."
  );
  emit({
    type: "escalated",
    ticketId,
    reason: "verification_inconclusive",
  });
  return "escalated";
}

export async function confirmOutcome(
  admin: Admin,
  session: AgentSession,
  answer: "yes" | "no"
): Promise<
  "resolved" | "next_hypothesis" | "escalated" | "rejected_no_verification"
> {
  if (answer === "no") {
    const next = (session.failed_hypotheses ?? 0) + 1;
    await writeStep(admin, session, {
      kind: "user_feedback",
      resultSummary: "no",
    });
    await updateSession(admin, session, {
      failed_hypotheses: next,
      verified_execution_id: null,
    });
    if (next >= getRequesterAgentMaxFailedHypotheses()) {
      await escalate(admin, session, "max_failed_hypotheses", "Still broken.");
      return "escalated";
    }
    return "next_hypothesis";
  }
  if (!session.verified_execution_id || !session.resolution_run_id)
    return "rejected_no_verification";
  const result = await admin
    .from("verification_results")
    .select("outcome")
    .eq("run_id", session.resolution_run_id)
    .eq("execution_id", session.verified_execution_id)
    .eq("outcome", "passed")
    .limit(1)
    .maybeSingle();
  if (!result.data) {
    await writeStep(admin, session, {
      kind: "user_feedback",
      resultSummary: "I can't mark this resolved without a passing check",
    });
    return "rejected_no_verification";
  }
  await admin
    .from("tickets")
    .update({ user_confirmed: true, verified_by_user: true })
    .eq("id", session.backing_ticket_id)
    .eq("organization_id", session.organization_id);
  const run = await admin
    .from("resolution_runs")
    .select("*")
    .eq("id", session.resolution_run_id)
    .eq("organization_id", session.organization_id)
    .maybeSingle();
  if (!run.data) return "rejected_no_verification";
  await verifyRun(admin, run.data as ResolutionRun);
  await writeStep(admin, session, {
    kind: "resolved",
    resultSummary: "Resolved after verification and requester confirmation.",
  });
  await updateSession(admin, session, {
    status: "resolved",
    ended_at: new Date().toISOString(),
    user_confirmed_at: new Date().toISOString(),
    resolution_summary:
      "Resolved after a passing verification check and requester confirmation.",
  });
  return "resolved";
}
