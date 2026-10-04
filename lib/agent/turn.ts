import {
  escalate,
  halt,
  hasServiceIncident,
  updateSession,
  writeStep,
} from "./session";
import { runAgentTurn, type AgentLoopDeps } from "./loop";
import {
  decideConsent as defaultDecideConsent,
  confirmOutcome as defaultConfirmOutcome,
} from "./actions";
import type { AgentEvent, AgentSession } from "./types";
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
import { sanitizeForUser } from "./untrusted";
import { alertSecurityEvent } from "@/lib/autonomy/alerts";

type Admin = ReturnType<typeof createAdminClient>;

export type AgentTurnDeps = Partial<AgentLoopDeps> & {
  runAgentTurn?: typeof runAgentTurn;
  decideConsent?: typeof defaultDecideConsent;
  confirmOutcome?: typeof defaultConfirmOutcome;
  transcribe?: ScreenshotTranscriber;
  intakeScreenshots?: typeof intakeScreenshots;
};

export async function handleAgentRequest(input: {
  admin: Admin;
  session: AgentSession;
  message: string;
  consent?: {
    approvalRequestId: string;
    decision: "approve" | "decline";
  };
  confirm?: "yes" | "no";
  sessionConsent?: "grant" | "revoke";
  attachmentIds?: string[];
  humanRequested?: boolean;
  platform?: string;
  emit: (event: AgentEvent) => void;
  signal: AbortSignal;
  deps?: AgentTurnDeps;
}): Promise<void> {
  const {
    admin,
    session,
    message,
    platform,
    emit,
    signal,
    deps,
    attachmentIds = [],
  } = input;
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
        message: sanitizeForUser(intake.message),
        recoverable: true,
      });
      if (!input.humanRequested) return;
    } else {
      for (const item of intake.items) {
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
    const dispatchEmit = (event: AgentEvent) => {
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
      { ...input.consent, userId: session.requester_id },
      dispatchEmit,
      signal
    );
    if (result === "invalid")
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
        userMessage: `Still broken after \`${capabilityId}\``,
        routing: {
          ...(screenshotAttached ? { screenshotAttached: true } : {}),
          failedVerification: true,
        },
        deps: loopDeps,
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
    userMessage,
    ...(screenshotAttached ? { routing: { screenshotAttached: true } } : {}),
    deps: loopDeps,
  });
}
