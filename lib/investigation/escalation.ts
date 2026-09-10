import type { Hypothesis, InvestigationContext, StepRef } from "@/lib/ai/types";
import { diagnosticQuestions } from "@/lib/ai/types";
import { getIssueBySlug } from "@/lib/search";
import { getIssueSteps } from "@/lib/steps";
import type { StepRisk } from "./policy";
import { getIssueStepPolicies } from "./policy";
import type { InvestigationRow, InvestigationTurnRow } from "./types";
import { loadEscalationInputs } from "./escalation-load";
import type { createAdminClient } from "@/lib/supabase/admin";
import { formatHandoffReason } from "@/lib/tickets/routing";

export type EscalationPackage = {
  version: 1;
  generatedAt: string;
  problem: {
    message: string;
    issueTitle: string | null;
    issueSlug: string | null;
    category: string | null;
    priority: string | null;
  };
  context: InvestigationContext & {
    platform: string | null;
    requesterRole: string | null;
    attachmentCount: number;
  };
  symptoms: string[];
  questionsAndAnswers: Array<{
    questionId: string;
    question: string | null;
    answer: string;
  }>;
  testsPerformed: Array<{
    tool: string;
    summary: string;
    result: string | null;
    at: string;
  }>;
  stepsAttempted: Array<{
    guideSlug: string;
    stepIndex: number;
    text: string | null;
    risk: StepRisk | null;
    outcome: "worked" | "failed" | "could_not_perform";
    at: string;
  }>;
  withheldSteps: Array<{
    guideSlug: string;
    stepIndex: number;
    text: string | null;
    risk: StepRisk;
  }>;
  likelyRootCause: {
    cause: string;
    confidence: number;
    evidence: string[];
  } | null;
  otherHypotheses: Hypothesis[];
  aiConfidence: number | null;
  sources: Array<{
    guideSlug: string;
    title: string;
    url: string | null;
  }>;
  handoff: {
    reason: string | null;
    detail: string | null;
    at: string | null;
    failedAttempts: number;
  };
  turns: number;
};

export type EscalationInputs = {
  ticket: {
    id: string;
    user_id: string;
    message: string;
    issue_id: string | null;
    issue_title: string | null;
    category: string | null;
    priority: string | null;
    platform: string | null;
    diagnostic_answers: unknown;
    handoff_reason: string | null;
    escalation_reason: string | null;
    needs_human_at: string | null;
    escalated_at: string | null;
    ai_failed_attempts: number | null;
    ai_confidence: number | null;
  };
  investigation: InvestigationRow | null;
  turns: InvestigationTurnRow[];
  stepOutcomes: Array<{
    guide_slug: string;
    step_index: number;
    outcome: "worked" | "failed" | "could_not_perform";
    created_at: string;
  }>;
  actions: Array<{
    tool_name: string;
    action_summary: string;
    result_summary: string | null;
    created_at: string;
  }>;
  requesterRole: string | null;
  attachmentCount: number;
};

const MAX_STRING = 300;

function text(value: unknown, max = MAX_STRING): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max = MAX_STRING): string | null {
  const result = text(value, max);
  return result || null;
}

function risk(value: unknown): StepRisk | null {
  return value === "safe" ||
    value === "caution" ||
    value === "approval" ||
    value === "specialist" ||
    value === "denied"
    ? value
    : null;
}

function sortByCreatedAt<T extends { created_at: string }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (left, right) =>
        left.row.created_at.localeCompare(right.row.created_at) ||
        left.index - right.index
    )
    .map(({ row }) => row);
}

function latestTurn(
  turns: InvestigationTurnRow[]
): InvestigationTurnRow | null {
  return (
    turns
      .map((turn, index) => ({ turn, index }))
      .sort(
        (left, right) =>
          right.turn.created_at.localeCompare(left.turn.created_at) ||
          left.index - right.index
      )[0]?.turn ?? null
  );
}

function issueTitle(slug: string): string {
  return getIssueBySlug(slug)?.title ?? slug;
}

function stepDetails(guideSlug: string, stepIndex: number) {
  const issue = getIssueBySlug(guideSlug);
  if (!issue) return { text: null, risk: null };
  const policy = getIssueStepPolicies(issue)[stepIndex];
  return {
    text: policy?.text ?? getIssueSteps(issue)[stepIndex] ?? null,
    risk: policy?.risk ?? null,
  };
}

function hypothesesFor(inputs: EscalationInputs): Hypothesis[] {
  const turn = latestTurn(inputs.turns);
  return (inputs.investigation?.hypotheses ?? turn?.hypotheses ?? [])
    .filter(
      (hypothesis): hypothesis is Hypothesis =>
        typeof hypothesis?.cause === "string" &&
        typeof hypothesis.confidence === "number" &&
        Array.isArray(hypothesis.evidence)
    )
    .map((hypothesis) => ({
      cause: text(hypothesis.cause),
      confidence: hypothesis.confidence,
      evidence: hypothesis.evidence
        .filter((item): item is string => typeof item === "string")
        .map((item) => text(item)),
      ...(hypothesis.guideSlug
        ? { guideSlug: text(hypothesis.guideSlug) }
        : {}),
    }))
    .sort((left, right) => right.confidence - left.confidence);
}

export function buildEscalationPackage(
  inputs: EscalationInputs,
  now = new Date()
): EscalationPackage {
  const turn = latestTurn(inputs.turns);
  const hypotheses = hypothesesFor(inputs);
  const [topHypothesis, ...otherHypotheses] = hypotheses;
  const evidence = hypotheses.flatMap((hypothesis) => hypothesis.evidence);
  const symptoms = [
    ...new Set(evidence.map((item) => text(item)).filter(Boolean)),
  ].slice(0, 20);
  const diagnosticAnswers = Array.isArray(inputs.ticket.diagnostic_answers)
    ? inputs.ticket.diagnostic_answers
    : [];
  const questionsAndAnswers = diagnosticAnswers
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const questionId =
        "questionId" in item && typeof item.questionId === "string"
          ? item.questionId
          : "";
      const answer =
        "answer" in item && typeof item.answer === "string"
          ? text(item.answer)
          : "";
      if (!questionId || !answer) return [];
      return [
        {
          questionId: text(questionId),
          question:
            diagnosticQuestions.find((question) => question.id === questionId)
              ?.text ?? null,
          answer,
        },
      ];
    })
    .slice(0, 10);
  const stepsAttempted = sortByCreatedAt(inputs.stepOutcomes)
    .slice(0, 40)
    .map((step) => {
      const details = stepDetails(step.guide_slug, step.step_index);
      return {
        guideSlug: text(step.guide_slug),
        stepIndex: step.step_index,
        text: details.text ? text(details.text) : null,
        risk: details.risk,
        outcome: step.outcome,
        at: step.created_at,
      };
    });
  const latestWithheld = turn?.withheld_steps ?? [];
  const withheldSteps = latestWithheld.slice(0, 40).map((step: StepRef) => {
    const details = stepDetails(step.guideSlug, step.stepIndex);
    return {
      guideSlug: text(step.guideSlug),
      stepIndex: step.stepIndex,
      text: details.text ? text(details.text) : null,
      risk: risk(step.risk) ?? details.risk ?? "approval",
    };
  });
  const sourceSlugs = [
    inputs.ticket.issue_id,
    ...stepsAttempted.map((step) => step.guideSlug),
  ].filter((slug): slug is string => Boolean(slug));
  const sources = [...new Set(sourceSlugs)].map((guideSlug) => ({
    guideSlug,
    title: issueTitle(guideSlug),
    url: null,
  }));
  const testsPerformed = sortByCreatedAt(inputs.actions)
    .slice(0, 20)
    .map((action) => ({
      tool: text(action.tool_name),
      summary: text(action.action_summary),
      result: nullableText(action.result_summary),
      at: action.created_at,
    }));
  const sourceContext = inputs.investigation?.context ?? {};
  const context = {
    platform: nullableText(inputs.ticket.platform),
    requesterRole: nullableText(inputs.requesterRole),
    attachmentCount: inputs.attachmentCount,
    ...(sourceContext.os ? { os: text(sourceContext.os) } : {}),
    ...(sourceContext.device ? { device: text(sourceContext.device) } : {}),
    ...(sourceContext.app ? { app: text(sourceContext.app) } : {}),
    ...(sourceContext.userRole
      ? { userRole: text(sourceContext.userRole) }
      : {}),
  };

  return {
    version: 1,
    generatedAt: now.toISOString(),
    problem: {
      message: text(inputs.ticket.message, 2000),
      issueTitle: nullableText(inputs.ticket.issue_title),
      issueSlug: nullableText(inputs.ticket.issue_id),
      category: nullableText(inputs.ticket.category),
      priority: nullableText(inputs.ticket.priority),
    },
    context,
    symptoms,
    questionsAndAnswers,
    testsPerformed,
    stepsAttempted,
    withheldSteps,
    likelyRootCause: topHypothesis
      ? {
          cause: text(topHypothesis.cause),
          confidence: topHypothesis.confidence,
          evidence: topHypothesis.evidence.map((item) => text(item)),
        }
      : null,
    otherHypotheses,
    aiConfidence: turn?.confidence ?? inputs.ticket.ai_confidence,
    sources,
    handoff: {
      reason: nullableText(inputs.ticket.handoff_reason),
      detail: nullableText(inputs.ticket.escalation_reason),
      at: inputs.ticket.needs_human_at ?? inputs.ticket.escalated_at,
      failedAttempts: inputs.ticket.ai_failed_attempts ?? 0,
    },
    turns: inputs.turns.length,
  };
}

export function summarizeEscalationPackage(pkg: EscalationPackage): string {
  const root = pkg.likelyRootCause
    ? `${pkg.likelyRootCause.cause} (${Math.round(pkg.likelyRootCause.confidence * 100)}% confidence)`
    : "No likely root cause recorded";
  const failed = pkg.stepsAttempted.filter(
    (step) => step.outcome !== "worked"
  ).length;
  const reason =
    formatHandoffReason(pkg.handoff.reason) ?? "No handoff reason recorded";
  const summary = `${pkg.problem.issueTitle ?? "Ticket"}: ${root}. ${pkg.stepsAttempted.length} steps tried (${failed} not completed). Handoff: ${reason}.`;
  return summary.slice(0, 600);
}

export async function snapshotEscalationPackage(
  admin: ReturnType<typeof createAdminClient>,
  ticketId: string,
  organizationId: string
): Promise<EscalationPackage | null> {
  try {
    const inputs = await loadEscalationInputs(admin, ticketId, organizationId);
    if (!inputs) return null;
    const generatedAt = new Date();
    const pkg = buildEscalationPackage(inputs, generatedAt);
    const investigation = inputs.investigation;
    const result = await admin.from("ticket_investigations").upsert(
      {
        ticket_id: ticketId,
        organization_id: organizationId,
        user_id: inputs.ticket.user_id,
        context: investigation?.context ?? {},
        hypotheses: investigation?.hypotheses ?? [],
        excluded_steps: investigation?.excluded_steps ?? [],
        status: investigation?.status ?? "escalated",
        escalation_package: pkg,
        escalation_package_at: generatedAt.toISOString(),
      },
      { onConflict: "ticket_id" }
    );
    if (result.error) throw result.error;
    return pkg;
  } catch (error) {
    console.error("Failed to snapshot escalation package.", error);
    return null;
  }
}
