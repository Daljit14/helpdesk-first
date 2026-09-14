import type {
  DiagnosticAnswer,
  Hypothesis,
  InvestigationContext,
} from "@/lib/ai/types";
import { diagnosticQuestions } from "@/lib/ai/types";
import { ISSUES } from "@/lib/issues";
import type {
  InvestigationRow,
  InvestigationTurnRow,
} from "@/lib/investigation/types";
import {
  mergeRedactionSummaries,
  type RedactionSummary,
} from "@/lib/knowledge/learning-redaction";
import { buildHypotheses } from "./hypotheses";
import { deriveFacts } from "./facts";
import { redactEvidenceText } from "./redaction";
import { deriveSafetyWarnings } from "./safety";
import type { EvidenceRecord } from "./types";

export type EvidenceInputs = {
  ticket: {
    message: string | null;
    platform: string | null;
    issue_id: string | null;
    diagnostic_answers: unknown;
    user_id?: string;
  };
  investigation: InvestigationRow | null;
  turns: InvestigationTurnRow[];
  stepOutcomes: {
    guide_slug: string;
    step_index: number;
    outcome: string;
    created_at: string;
  }[];
  attachments: {
    id: string;
    kind?: string | null;
    declared_mime?: string | null;
    status: string;
    scan_verdict: string | null;
    page_count: number | null;
    width: number | null;
    height: number | null;
  }[];
  now?: Date;
};

function diagnosticAnswers(value: unknown): DiagnosticAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return typeof record.questionId === "string" &&
      typeof record.answer === "string"
      ? [{ questionId: record.questionId, answer: record.answer }]
      : [];
  });
}

function latestTurn(
  turns: InvestigationTurnRow[]
): InvestigationTurnRow | null {
  return (
    [...turns].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ??
    null
  );
}

function hypothesesFor(
  investigation: InvestigationRow | null,
  turn: InvestigationTurnRow | null
): Hypothesis[] {
  return investigation?.hypotheses?.length
    ? investigation.hypotheses
    : (turn?.hypotheses ?? []);
}

function citationsFor(
  matchedSlug: string | null,
  hypotheses: Hypothesis[]
): EvidenceRecord["citations"] {
  const slugs = [
    matchedSlug,
    ...hypotheses.map((hypothesis) => hypothesis.guideSlug ?? null),
  ].filter((slug): slug is string => Boolean(slug));
  return [...new Set(slugs)].flatMap((guideSlug) => {
    const issue = ISSUES.find((candidate) => candidate.id === guideSlug);
    return issue
      ? [{ guideSlug, title: issue.title, path: `/issues/${guideSlug}` }]
      : [];
  });
}

export function buildEvidence(
  inputs: EvidenceInputs,
  now = inputs.now ?? new Date()
): EvidenceRecord {
  const description = redactEvidenceText(inputs.ticket.message ?? "");
  const rawAnswers = diagnosticAnswers(inputs.ticket.diagnostic_answers);
  const redactedAnswers = rawAnswers.map((answer) => {
    const redacted = redactEvidenceText(answer.answer, 1000);
    return { ...answer, answer: redacted.text, summary: redacted.summary };
  });
  const redaction: RedactionSummary = mergeRedactionSummaries(
    description.summary,
    ...redactedAnswers.map((answer) => answer.summary)
  );
  const qa = redactedAnswers.map(({ questionId, answer }) => ({
    questionId,
    question:
      diagnosticQuestions.find((candidate) => candidate.id === questionId)
        ?.text ?? null,
    answer,
  }));
  const context = inputs.investigation?.context ?? ({} as InvestigationContext);
  const facts = deriveFacts({
    platform: inputs.ticket.platform,
    context,
    qa: redactedAnswers,
    stepOutcomes: inputs.stepOutcomes,
    attachments: inputs.attachments,
  });
  const turn = latestTurn(inputs.turns);
  const hypotheses = buildHypotheses(
    hypothesesFor(inputs.investigation, turn),
    facts.tests
  );
  const missingInformation = [...new Set(facts.missingInformation)];
  if (!context.os) missingInformation.push("operating system");
  if (!context.device) missingInformation.push("device");
  return {
    version: 1,
    generatedAt: now.toISOString(),
    description: description.text,
    redaction,
    context: {
      platform: inputs.ticket.platform,
      os: context.os ?? null,
      device: context.device ?? null,
      app: context.app ?? null,
      deviceOwnership: facts.deviceOwnership,
    },
    attachmentFindings: facts.attachmentFindings,
    qa,
    confirmedFacts: facts.confirmedFacts,
    unknownFacts: facts.unknownFacts,
    hypotheses,
    citations: citationsFor(
      turn?.matched_issue_slug ?? inputs.ticket.issue_id,
      hypothesesFor(inputs.investigation, turn)
    ),
    safetyWarnings: deriveSafetyWarnings({
      description: inputs.ticket.message ?? "",
      redaction,
      qa: rawAnswers,
    }),
    missingInformation: [...new Set(missingInformation)],
  };
}
