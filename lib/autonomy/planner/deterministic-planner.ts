import type { PlannerOutput } from "./schema";
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
    const escalate = (reason: string): PlannerOutput => {
      const capability = allowed("escalate_with_evidence");
      if (capability) {
        return {
          diagnosis: "No safe automatic capability applies; escalating.",
          capabilityId: capability.id,
          capabilityVersion: capability.version,
          parameters: { ticketId, reason },
          expectedEvidence: ["Ticket is handed to the IT team with evidence."],
        };
      }
      return { decision: "escalate", reason };
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
          diagnosis: "Likely notification delivery failure.",
          capabilityId: retry.id,
          capabilityVersion: retry.version,
          parameters: { ticketId, notificationId: failedNotificationId },
          expectedEvidence: ["Outbox status becomes sent."],
        };
      }
      const status = allowed("check_helpdesk_service_status");
      if (status) {
        return {
          diagnosis: "Possible platform-side notification outage.",
          capabilityId: status.id,
          capabilityVersion: status.version,
          parameters: { ticketId },
          expectedEvidence: ["Service status response captured."],
        };
      }
    }

    if (evidence.missingInformation.length > 0) {
      const ask = allowed("ask_diagnostic_question");
      if (ask) {
        return {
          diagnosis: "Investigation needs one more diagnostic answer.",
          capabilityId: ask.id,
          capabilityVersion: ask.version,
          parameters: {
            ticketId,
            questionId: slug(evidence.missingInformation[0]),
          },
          expectedEvidence: ["Diagnostic answer is recorded."],
        };
      }
    }

    const search = allowed("search_approved_knowledge");
    if (search) {
      const top = [...evidence.hypotheses].sort(
        (left, right) => right.confidence - left.confidence
      )[0];
      return {
        diagnosis: "Approved knowledge may cover the likely cause.",
        capabilityId: search.id,
        capabilityVersion: search.version,
        parameters: { ticketId, query: top.cause.slice(0, 200) },
        expectedEvidence: ["Approved guides matching the cause are listed."],
      };
    }

    return escalate("no_applicable_capability");
  }
}
