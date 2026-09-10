import { getAiModel, getAiProviderKind } from "@/lib/ai/config";
import { processAiIntake, type IntakeResult } from "@/lib/ai/intake";
import type { AiIntakeInput, AiProvider, Hypothesis } from "@/lib/ai/types";
import { ISSUES, type Issue } from "@/lib/issues";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInvestigationEnabled } from "./config";
import {
  containsFailedStep,
  deriveNextSteps,
  deriveWithheldSteps,
} from "./steps";
import type { Audience } from "./policy";

type InvestigationClient = ReturnType<typeof createAdminClient>;

export type InvestigationTurnInput = {
  input: AiIntakeInput;
  provider: AiProvider;
  allowedSlugs: string[];
  ticketId?: string;
  organizationId?: string | null;
  userId?: string;
  persist?: boolean;
  audience?: Audience;
  admin?: InvestigationClient;
};

export type InvestigationTurnResult = IntakeResult & {
  turnId?: number;
};

export function fallbackHypothesis(
  issue: Issue,
  input: AiIntakeInput,
  confidence: number | undefined
): Hypothesis {
  const normalizedInput = [
    input.message,
    ...(input.previousAnswers ?? []).map(({ answer }) => answer),
  ]
    .join(" ")
    .toLowerCase();
  const evidence = issue.symptoms
    .filter((symptom) => normalizedInput.includes(symptom.toLowerCase()))
    .slice(0, 3);
  const fallbackEvidence =
    evidence.length > 0
      ? evidence
      : [
          `Assistant matched approved guide "${issue.title.slice(
            0,
            120 - 'Assistant matched approved guide "'.length - 1
          )}"`,
        ];

  return {
    cause: issue.title,
    confidence: Math.min(Math.max(confidence ?? 0.5, 0.35), 0.95),
    evidence: fallbackEvidence,
    guideSlug: issue.id,
  };
}

async function persistTurn(
  params: InvestigationTurnInput,
  result: Extract<IntakeResult, { status: "success" }>,
  failedSteps: NonNullable<AiIntakeInput["failedSteps"]>
): Promise<number | undefined> {
  if (!params.ticketId || !params.userId) return undefined;
  const admin = params.admin ?? createAdminClient();
  const output = result.output;
  const status = output.decision === "escalate" ? "escalated" : "open";
  const investigation = await admin
    .from("ticket_investigations")
    .upsert(
      {
        ticket_id: params.ticketId,
        organization_id: params.organizationId ?? null,
        user_id: params.userId,
        updated_at: new Date().toISOString(),
        context: params.input.context ?? {},
        hypotheses: output.hypotheses ?? [],
        excluded_steps: failedSteps,
        status,
      },
      { onConflict: "ticket_id" }
    )
    .select("ticket_id")
    .single();
  if (investigation.error) throw investigation.error;

  const turn = await admin
    .from("ticket_investigation_turns")
    .insert({
      ticket_id: params.ticketId,
      organization_id: params.organizationId ?? null,
      decision: output.decision,
      confidence: output.confidence ?? null,
      matched_issue_slug: output.matchedIssueSlug ?? null,
      question_ids: output.diagnosticQuestionIds ?? [],
      hypotheses: output.hypotheses ?? [],
      next_steps: output.nextSteps ?? [],
      withheld_steps: output.withheldSteps ?? [],
      provider: getAiProviderKind(),
      model: getAiModel(),
    })
    .select("id")
    .single();
  if (turn.error) throw turn.error;
  return typeof turn.data?.id === "number" ? turn.data.id : undefined;
}

export async function runInvestigationTurn(
  params: InvestigationTurnInput
): Promise<InvestigationTurnResult> {
  const result = await processAiIntake(params.input, {
    provider: params.provider,
    allowedSlugs: params.allowedSlugs,
  });
  if (result.status !== "success") {
    return result;
  }

  const failedSteps = params.input.failedSteps ?? [];
  const audience = params.audience ?? "requester";
  let output = result.output;
  if (result.output.matchedIssueSlug) {
    const issue = ISSUES.find(
      (candidate) => candidate.id === result.output.matchedIssueSlug
    );
    if (issue) {
      if ((output.hypotheses ?? []).length === 0) {
        output = {
          ...output,
          hypotheses: [
            fallbackHypothesis(issue, params.input, result.output.confidence),
          ],
        };
      }
      const nextSteps = deriveNextSteps(issue, failedSteps, audience);
      const withheldSteps = deriveWithheldSteps(issue, audience);
      output = { ...output, nextSteps, withheldSteps };
      if (nextSteps.length === 0) {
        output = {
          decision: "escalate",
          escalationReason:
            withheldSteps.length > 0
              ? "Remaining steps for this guide require IT approval."
              : "All approved steps for the matching guide were already tried.",
          confidence: output.confidence,
          hypotheses: output.hypotheses,
          nextSteps: [],
          withheldSteps,
        };
      }
      if (
        output.nextSteps?.some(
          (step) => step.risk === "specialist" || step.risk === "denied"
        ) ||
        (audience === "requester" &&
          output.nextSteps?.some((step) => step.risk === "approval"))
      ) {
        throw new Error("Investigation next steps violate step policy.");
      }
      if (containsFailedStep(output.nextSteps ?? [], failedSteps)) {
        throw new Error("Investigation next steps include a failed step.");
      }
    }
  }

  const nextResult: Extract<IntakeResult, { status: "success" }> = {
    status: "success",
    output,
  };
  const persist =
    params.persist ?? (isInvestigationEnabled() && Boolean(params.ticketId));
  if (!persist) return nextResult;
  try {
    const turnId = await persistTurn(params, nextResult, failedSteps);
    return { ...nextResult, turnId };
  } catch (error) {
    console.error("Failed to persist investigation turn.", error);
    return nextResult;
  }
}
