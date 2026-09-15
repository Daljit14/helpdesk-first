import type { PlannerOutput } from "../guardrails/planner-output";
import { getCapability } from "../capabilities/registry";
import type { Planner, PlannerInput } from "./types";

const NOTIFICATION_PATTERN =
  /\b(notification|email|e-mail|message)\b.*\b(not|never|didn'?t|hasn'?t|no)\b.*\b(receiv|arriv|deliver|sent|got)/i;

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64) || "unknown"
  );
}

export class DeterministicPlanner implements Planner {
  readonly id = "deterministic";
  readonly version = "1";

  async plan(input: PlannerInput): Promise<PlannerOutput> {
    const failed = new Set(
      input.priorAttempts
        .filter((attempt) => attempt.status !== "succeeded")
        .map((attempt) => `${attempt.capabilityId}@${attempt.version}`)
    );
    const allowed = (id: string) => {
      const match = input.allowedCapabilities.find(
        (capability) =>
          capability.id === id && !failed.has(`${id}@${capability.version}`)
      );
      return match ?? null;
    };
    const ticketId = input.ticket.id;
    const evidenceIds = (input.evidence?.confirmedFacts ?? [])
      .map((fact) => fact.id)
      .concat(
        (input.evidence?.hypotheses ?? []).map((hypothesis) => hypothesis.id)
      )
      .slice(0, 10);
    const safeEvidenceIds = evidenceIds.length > 0 ? evidenceIds : ["ticket"];
    const diagnosis = (summary: string) => ({
      summary,
      confidence: input.evidence?.hypotheses[0]?.confidence ?? 0,
      evidenceIds: safeEvidenceIds,
    });
    const escalate = (reason: string): PlannerOutput => {
      return {
        ticketId,
        diagnosis: diagnosis(
          "No safe automatic capability applies; escalating."
        ),
        decision: "escalate",
        reason,
      };
    };

    const evidence = input.evidence;
    if (!evidence || evidence.hypotheses.length === 0) {
      return escalate("no_evidence");
    }

    const text = [
      evidence.description,
      ...evidence.confirmedFacts.map((fact) => fact.statement),
      ...evidence.unknownFacts,
      ...evidence.hypotheses.map((hypothesis) => hypothesis.cause),
    ].join(" ");

    if (NOTIFICATION_PATTERN.test(text)) {
      const failedNotificationId = input.ticket.context?.failedNotificationId;
      const retry = allowed("retry_failed_notification");
      if (retry && failedNotificationId) {
        return {
          ticketId,
          diagnosis: diagnosis("Likely notification delivery failure."),
          decision: "propose_action",
          capability: {
            id: retry.id,
            version: retry.version,
            parameters: { ticketId, notificationId: failedNotificationId },
          },
          verificationMethod:
            getCapability(retry.id, retry.version)?.verification ??
            "verification_pending",
        };
      }
      const status = allowed("check_helpdesk_service_status");
      if (status) {
        return {
          ticketId,
          diagnosis: diagnosis("Possible platform-side notification outage."),
          decision: "propose_action",
          capability: {
            id: status.id,
            version: status.version,
            parameters: { ticketId },
          },
          verificationMethod:
            getCapability(status.id, status.version)?.verification ??
            "verification_pending",
        };
      }
    }

    if (evidence.missingInformation.length > 0) {
      const ask = allowed("ask_diagnostic_question");
      if (ask) {
        return {
          ticketId,
          diagnosis: diagnosis(
            "Investigation needs one more diagnostic answer."
          ),
          decision: "propose_action",
          capability: {
            id: ask.id,
            version: ask.version,
            parameters: {
              ticketId,
              questionId: slug(evidence.missingInformation[0]),
            },
          },
          verificationMethod:
            getCapability(ask.id, ask.version)?.verification ??
            "verification_pending",
        };
      }
    }

    const search = allowed("search_approved_knowledge");
    if (search) {
      const top = [...evidence.hypotheses].sort(
        (left, right) => right.confidence - left.confidence
      )[0];
      return {
        ticketId,
        diagnosis: diagnosis("Approved knowledge may cover the likely cause."),
        decision: "propose_action",
        capability: {
          id: search.id,
          version: search.version,
          parameters: { ticketId, query: top.cause.slice(0, 200) },
        },
        verificationMethod:
          getCapability(search.id, search.version)?.verification ??
          "verification_pending",
      };
    }

    return escalate("no_applicable_capability");
  }
}
