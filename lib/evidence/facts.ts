import type { DiagnosticAnswer } from "@/lib/ai/types";
import type { AttachmentFinding, Fact, TestRef } from "./types";

type StepOutcome = {
  guide_slug: string;
  step_index: number;
  outcome: string;
  created_at?: string;
};

type Attachment = {
  id: string;
  kind?: string | null;
  declared_mime?: string | null;
  status: string;
  scan_verdict: string | null;
  page_count: number | null;
  width: number | null;
  height: number | null;
};

export type DerivedFacts = {
  confirmedFacts: Fact[];
  unknownFacts: string[];
  deviceOwnership: "personal" | "organization" | "unknown";
  missingInformation: string[];
  tests: TestRef[];
  attachmentFindings: AttachmentFinding[];
};

function answerFor(qa: DiagnosticAnswer[], questionId: string): string | null {
  const answer = qa.find((item) => item.questionId === questionId)?.answer;
  return typeof answer === "string" && answer.trim() ? answer.trim() : null;
}

function attachmentKind(attachment: Attachment): "image" | "pdf" | "other" {
  const value = `${attachment.kind ?? ""} ${attachment.declared_mime ?? ""}`;
  if (value.startsWith("image/") || /\bimage\b/i.test(value)) return "image";
  if (value.includes("pdf")) return "pdf";
  return "other";
}

export function deriveFacts(input: {
  platform: string | null;
  context?: { os?: string; device?: string; app?: string };
  qa: DiagnosticAnswer[];
  stepOutcomes: StepOutcome[];
  attachments: Attachment[];
}): DerivedFacts {
  const confirmedFacts: Fact[] = [];
  const unknownFacts: string[] = [];
  const missingInformation: string[] = [];
  const platform = input.platform?.trim() || null;
  if (platform) {
    confirmedFacts.push({
      id: `platform:${platform}`,
      statement: `Platform is ${platform}.`,
      source: "context",
    });
  } else {
    missingInformation.push("platform");
  }

  const ownershipAnswers = [
    answerFor(input.qa, "network-owner"),
    answerFor(input.qa, "account-managed"),
  ]
    .filter(Boolean)
    .join(" ");
  let deviceOwnership: "personal" | "organization" | "unknown" = "unknown";
  if (
    /(work|school|company|organi[sz]ation|managed|IT)/i.test(ownershipAnswers)
  ) {
    deviceOwnership = "organization";
  } else if (/(mine|my own|personal|home)/i.test(ownershipAnswers)) {
    deviceOwnership = "personal";
  } else {
    unknownFacts.push("device ownership");
  }

  const restarted = answerFor(input.qa, "already-restarted");
  if (restarted && /\b(yes|yeah|already|did)\b/i.test(restarted)) {
    confirmedFacts.push({
      id: "restart_attempted",
      statement: "The requester reports restarting the device or app.",
      source: "user_answer",
    });
  } else if (restarted && /\b(no|not yet|haven't|didn't)\b/i.test(restarted)) {
    confirmedFacts.push({
      id: "restart_not_attempted",
      statement: "The requester reports not restarting the device or app.",
      source: "user_answer",
    });
  }

  const errorMessage = answerFor(input.qa, "error-message");
  if (errorMessage) {
    confirmedFacts.push({
      id: "error_message_reported",
      statement: errorMessage.slice(0, 160),
      source: "user_answer",
    });
  } else {
    missingInformation.push("error message");
  }
  if (answerFor(input.qa, "when-started")) {
    confirmedFacts.push({
      id: "onset_reported",
      statement: "The requester reported when the issue started.",
      source: "user_answer",
    });
  }

  const tests: TestRef[] = input.stepOutcomes.flatMap((step) => {
    const result =
      step.outcome === "worked" || step.outcome === "succeeded"
        ? "supports"
        : step.outcome === "failed" || step.outcome === "could_not_perform"
          ? "rejects"
          : null;
    if (!result) return [];
    return [
      {
        id: `${step.guide_slug}#${step.step_index}`,
        kind: "step_outcome" as const,
        summary: `Step ${step.step_index} of ${step.guide_slug}: ${step.outcome}`,
        result,
        ...(step.created_at ? { at: step.created_at } : {}),
      },
    ];
  });

  const attachmentFindings = input.attachments.flatMap((attachment) => {
    if (attachment.status !== "ready" || attachment.scan_verdict !== "clean") {
      return [];
    }
    return [
      {
        attachmentId: attachment.id,
        kind: attachmentKind(attachment),
        scanVerdict: "clean" as const,
        pageCount: attachment.page_count,
        width: attachment.width,
        height: attachment.height,
      },
    ];
  });
  const excludedAttachments =
    input.attachments.length - attachmentFindings.length;
  if (excludedAttachments > 0) {
    unknownFacts.push(
      `${excludedAttachments} attachment(s) not yet scanned clean`
    );
  }

  return {
    confirmedFacts,
    unknownFacts: [...new Set(unknownFacts)],
    deviceOwnership,
    missingInformation: [...new Set(missingInformation)],
    tests,
    attachmentFindings,
  };
}
