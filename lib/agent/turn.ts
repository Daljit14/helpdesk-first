import {
  escalate,
  halt,
  hasServiceIncident,
  updateSession,
  writeStep,
  loadRequesterIdentifiers,
} from "./session";
import { runAgentTurn, type AgentLoopDeps } from "./loop";
import {
  decideConsent as defaultDecideConsent,
  confirmOutcome as defaultConfirmOutcome,
} from "./actions";
import type { AgentEvent, AgentSession } from "./types";
import { getIssueBySlug } from "@/lib/search";
import { getIssueStepPolicies } from "@/lib/investigation/policy";
import type { UserStepOutcome } from "./user-steps";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  autorunCoveredCapabilities,
  grantSessionConsent,
  revokeSessionConsent,
  sessionConsentTitles,
} from "./session-consent";
import {
  isRequesterAgentAutorunEnabledForOrg,
  isServiceHealthEnabled,
} from "@/lib/admin/flags";
import {
  createScreenshotTranscriber,
  type ScreenshotTranscriber,
} from "./model";
import { intakeScreenshots } from "./screenshots";
import {
  guardAgentEvent,
  toUserText,
  type OutputGuardContext,
} from "./output-guard";
import { alertSecurityEvent } from "@/lib/autonomy/alerts";
import type { AssuranceFacts } from "@/lib/identity/assurance";
import { INSTRUCTION_WITHHELD } from "./untrusted";

type Admin = ReturnType<typeof createAdminClient>;

export type AgentTurnDeps = Partial<AgentLoopDeps> & {
  runAgentTurn?: typeof runAgentTurn;
  decideConsent?: typeof defaultDecideConsent;
  confirmOutcome?: typeof defaultConfirmOutcome;
  transcribe?: ScreenshotTranscriber;
  intakeScreenshots?: typeof intakeScreenshots;
  loadRequesterIdentifiers?: typeof loadRequesterIdentifiers;
};

type HandleAgentRequestInput = {
  admin: Admin;
  session: AgentSession;
  message: string;
  consent?: {
    approvalRequestId: string;
    decision: "approve" | "decline";
    reconfirmTainted?: boolean;
  };
  confirm?: "yes" | "no";
  sessionConsent?: "grant" | "revoke";
  attachmentIds?: string[];
  userStep?: { stepId: string; outcome: UserStepOutcome };
  humanRequested?: boolean;
  platform?: string;
  emit: (event: AgentEvent) => void;
  signal: AbortSignal;
  deps?: AgentTurnDeps;
  assurance?: AssuranceFacts;
};

export async function handleAgentRequest(
  input: HandleAgentRequestInput
): Promise<void> {
  const { admin, session, deps } = input;
  const outputGuard: OutputGuardContext = {
    requesterIdentifiers: [],
    redactions: [],
  };
  const emit = (event: AgentEvent) =>
    input.emit(guardAgentEvent(event, outputGuard));
  try {
    try {
      outputGuard.requesterIdentifiers = await (
        deps?.loadRequesterIdentifiers ?? loadRequesterIdentifiers
      )(admin, session);
    } catch {
      outputGuard.requesterIdentifiers = [];
    }
    await handleAgentRequestBody(input, outputGuard, emit);
  } finally {
    const redactions = outputGuard.redactions ?? [];
    if (redactions.length > 0) {
      const kinds = [
        ...new Set(redactions.map((redaction) => redaction.kind)),
      ].sort();
      try {
        await (deps?.writeStep ?? writeStep)(admin, session, {
          kind: "reply_redacted",
          resultSummary: JSON.stringify({ kinds, count: redactions.length }),
        });
      } catch {
        // A missing migration must not interrupt an agent reply.
      }
    }
  }
}

async function handleAgentRequestBody(
  input: HandleAgentRequestInput,
  outputGuard: OutputGuardContext,
  emit: (event: AgentEvent) => void
): Promise<void> {
  const {
    admin,
    session,
    message,
    platform,
    signal,
    deps,
    attachmentIds = [],
  } = input;
  if (input.userStep) {
    const unavailable = () =>
      emit({
        type: "error",
        message: "That step is no longer available.",
        recoverable: true,
      });
    const offered = await admin
      .from("agent_steps")
      .select("params_hash")
      .eq("id", input.userStep.stepId)
      .eq("session_id", session.id)
      .eq("kind", "user_step_offered")
      .maybeSingle();
    const paramsHash = offered.data?.params_hash;
    if (offered.error || !paramsHash) {
      unavailable();
      return;
    }
    const existingOutcome = await admin
      .from("agent_steps")
      .select("id")
      .eq("session_id", session.id)
      .eq("kind", "user_step_outcome")
      .eq("params_hash", input.userStep.stepId)
      .limit(1)
      .maybeSingle();
    if (existingOutcome.error || existingOutcome.data) {
      unavailable();
      return;
    }
    const match = /^([a-z0-9-]{1,80})#(\d+)$/.exec(paramsHash);
    const stepIndex = match ? Number(match[2]) : -1;
    const issue = match ? getIssueBySlug(match[1]) : undefined;
    const instruction =
      issue &&
      Number.isSafeInteger(stepIndex) &&
      stepIndex >= 0 &&
      getIssueStepPolicies(issue)[stepIndex]?.text;
    if (!instruction) {
      unavailable();
      return;
    }
    await (deps?.writeStep ?? writeStep)(admin, session, {
      kind: "user_step_outcome",
      paramsHash: input.userStep.stepId,
      resultSummary: input.userStep.outcome,
    });
    const userMessage =
      input.userStep.outcome === "done"
        ? `User step result: done — the user completed "${instruction}". Ask whether the problem is solved; do not claim it is fixed.`
        : input.userStep.outcome === "didnt_work"
          ? `User step result: didn't work — "${instruction}" did not help. Try the next hypothesis.`
          : `User step result: the user can't do "${instruction}". Offer a different approach or escalate.`;
    const injectedRunAgentTurn = deps?.runAgentTurn ?? runAgentTurn;
    const loopDeps = { ...deps };
    delete loopDeps.runAgentTurn;
    await injectedRunAgentTurn({
      admin,
      session,
      platform,
      emit,
      signal,
      outputGuard,
      userMessage,
      trustedSystemEvent: true,
      ...(input.userStep.outcome === "didnt_work"
        ? { routing: { failedVerification: true } }
        : {}),
      deps: loopDeps,
      assurance: input.assurance,
    });
    return;
  }
  if (input.sessionConsent) {
    if (input.sessionConsent === "grant") {
      const granted = await grantSessionConsent(
        admin,
        session,
        session.requester_id
      );
      emit({
        type: "session_consent",
        state: "granted",
        capabilityIds: granted.capabilityIds,
      });
    } else {
      await revokeSessionConsent(admin, session);
      emit({
        type: "session_consent",
        state: "revoked",
        capabilityIds: session.autorun_consent_capabilities ?? [],
      });
    }
    return;
  }
  let userMessage = message;
  let screenshotAttached = false;
  if (attachmentIds.length > 0) {
    const intake = await (deps?.intakeScreenshots ?? intakeScreenshots)(
      admin,
      session,
      attachmentIds,
      {
        transcribe: deps?.transcribe ?? createScreenshotTranscriber(),
        signal,
        outputGuard,
      }
    );
    if (!intake.ok) {
      if (intake.injection) {
        await (deps?.writeStep ?? writeStep)(admin, session, {
          kind: "security_incident",
          resultSummary: "injection_in_tool_output",
        });
        const ticketId = await (deps?.halt ?? halt)(
          admin,
          session,
          "injection_in_tool_output",
          message,
          true
        );
        await (deps?.alert ?? alertSecurityEvent)(admin, {
          organizationId: session.organization_id,
          ticketId,
          runId: null,
          kind: "requester_agent_tripwire:injection_in_tool_output",
        });
        emit({ type: "halted", reason: "injection_in_tool_output", ticketId });
        return;
      }
      await (deps?.writeStep ?? writeStep)(admin, session, {
        kind: "screenshot_rejected",
        resultSummary: intake.code,
      });
      emit({
        type: "error",
        message: toUserText(intake.message, outputGuard),
        recoverable: true,
      });
      if (!input.humanRequested) return;
    } else {
      for (const item of intake.items) {
        if (item.modelText.includes(INSTRUCTION_WITHHELD))
          await (deps?.writeStep ?? writeStep)(admin, session, {
            kind: "tripwire_instruction_content",
            toolName: "screenshot",
          });
        await (deps?.writeStep ?? writeStep)(admin, session, {
          kind: "screenshot_received",
          attachmentId: item.attachmentId,
          paramsHash: item.sha256,
          resultSummary: item.userSummary,
        });
        emit({
          type: "screenshot_received",
          attachmentId: item.attachmentId,
          summary: item.userSummary,
        });
      }
      if (intake.items.length > 0) {
        screenshotAttached = true;
        userMessage = [
          message || "I shared a screenshot of the problem.",
          ...intake.items.map((item) => item.modelText),
        ].join("\n\n");
        session.tool_call_count += intake.items.length;
        await (deps?.updateSession ?? updateSession)(admin, session, {
          tool_call_count: session.tool_call_count,
        });
      }
    }
  }
  if (input.humanRequested) {
    const ticketId = await (deps?.escalate ?? escalate)(
      admin,
      session,
      "user_requested_human",
      message
    );
    emit({
      type: "escalated",
      ticketId,
      reason: "user_requested_human",
    });
    return;
  }
  if (input.consent) {
    if (
      input.consent.decision === "approve" &&
      (deps?.serviceHealthEnabled ?? isServiceHealthEnabled())
    ) {
      let serviceIncidentActive = true;
      try {
        serviceIncidentActive = await (
          deps?.hasServiceIncident ?? hasServiceIncident
        )(admin, session);
      } catch {
        serviceIncidentActive = true;
      }
      if (serviceIncidentActive) {
        await (deps?.writeStep ?? writeStep)(admin, session, {
          kind: "action_rejected",
          toolName: "propose_action",
          resultSummary: "service_incident_active: consent approval blocked",
        });
        emit({
          type: "error",
          message:
            "Actions are paused because a matching service outage is active.",
          recoverable: true,
        });
        return;
      }
    }
    let capabilityId = "the requested action";
    let stepUpEmitted = false;
    const dispatchEmit = (event: AgentEvent) => {
      if (event.type === "step_up_required") stepUpEmitted = true;
      if (
        event.type === "consent_declined" ||
        event.type === "action_executing"
      )
        capabilityId = event.capabilityId;
      emit(event);
    };
    const result = await (deps?.decideConsent ?? defaultDecideConsent)(
      admin,
      session,
      {
        ...input.consent,
        userId: session.requester_id,
        assurance: input.assurance,
      },
      dispatchEmit,
      signal
    );
    if (result === "invalid" && !stepUpEmitted)
      emit({
        type: "error",
        message: "That consent request is no longer available.",
      });
    else if (result === "declined" || result === "executed_verified_failed") {
      const injectedRunAgentTurn = deps?.runAgentTurn ?? runAgentTurn;
      const loopDeps = { ...deps };
      delete loopDeps.runAgentTurn;
      await injectedRunAgentTurn({
        admin,
        session,
        platform,
        emit,
        signal,
        outputGuard,
        assurance: input.assurance,
        userMessage:
          result === "declined"
            ? `User declined \`${capabilityId}\``
            : `The fix \`${capabilityId}\` was rolled back after verification failed`,
        routing: {
          ...(screenshotAttached ? { screenshotAttached: true } : {}),
          ...(result === "executed_verified_failed"
            ? { failedVerification: true }
            : {}),
        },
        deps: loopDeps,
      });
    }
    return;
  }
  if (input.confirm) {
    const result = await (deps?.confirmOutcome ?? defaultConfirmOutcome)(
      admin,
      session,
      input.confirm
    );
    if (result === "resolved")
      emit({
        type: "resolved",
        text: "Your support request has been resolved.",
      });
    else if (result === "rejected_no_verification")
      emit({
        type: "error",
        message: "I can't mark this resolved without a passing check",
      });
    else if (result === "escalated")
      emit({
        type: "escalated",
        ticketId: session.escalation_ticket_id ?? "",
        reason: "max_failed_hypotheses",
      });
    else if (result === "next_hypothesis") {
      const injectedRunAgentTurn = deps?.runAgentTurn ?? runAgentTurn;
      const loopDeps = { ...deps };
      delete loopDeps.runAgentTurn;
      let capabilityId = "the attempted fix";
      if (typeof admin.from === "function") {
        const latest = await admin
          .from("agent_steps")
          .select("capability_id")
          .eq("session_id", session.id)
          .not("capability_id", "is", null)
          .order("seq", { ascending: false })
          .limit(1)
          .maybeSingle();
        capabilityId = latest.data?.capability_id ?? capabilityId;
      }
      await injectedRunAgentTurn({
        admin,
        session,
        platform,
        emit,
        signal,
        outputGuard,
        userMessage: `Still broken after \`${capabilityId}\``,
        routing: {
          ...(screenshotAttached ? { screenshotAttached: true } : {}),
          failedVerification: true,
        },
        deps: loopDeps,
        assurance: input.assurance,
      });
    }
    return;
  }

  if (
    isRequesterAgentAutorunEnabledForOrg(session.organization_id) &&
    !session.autorun_consent_granted_at &&
    !session.autorun_consent_revoked_at
  ) {
    const existing = await admin
      .from("agent_steps")
      .select("id")
      .eq("session_id", session.id)
      .eq("kind", "session_consent_offered")
      .limit(1)
      .maybeSingle();
    if (!existing.data) {
      const capabilityIds = await autorunCoveredCapabilities(
        admin,
        session.organization_id
      );
      if (capabilityIds.length > 0) {
        const expiresInMs = Math.min(
          4 * 60 * 60_000,
          Math.max(
            1_000,
            Number(
              process.env.HELP_DESK_REQUESTER_AGENT_SESSION_CONSENT_TTL_MS
            ) || 60 * 60_000
          )
        );
        await writeStep(admin, session, {
          kind: "session_consent_offered",
          resultSummary: capabilityIds.join(", "),
        });
        emit({
          type: "session_consent_offer",
          card: {
            title:
              "Allow the assistant to apply safe, reversible fixes during this session?",
            capabilities: sessionConsentTitles(capabilityIds),
            expiresInMs,
          },
        });
      }
    }
  }

  const injectedRunAgentTurn = deps?.runAgentTurn ?? runAgentTurn;
  const loopDeps = { ...deps };
  delete loopDeps.runAgentTurn;
  await injectedRunAgentTurn({
    admin,
    session,
    platform,
    emit,
    signal,
    outputGuard,
    userMessage,
    ...(screenshotAttached ? { routing: { screenshotAttached: true } } : {}),
    deps: loopDeps,
    assurance: input.assurance,
  });
}
