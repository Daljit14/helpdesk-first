import { getAiModel, getAiProviderKind } from "@/lib/ai/config";
import { processAiIntake, type IntakeResult } from "@/lib/ai/intake";
import type { AiIntakeInput, AiProvider } from "@/lib/ai/types";
import { ISSUES } from "@/lib/issues";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInvestigationEnabled } from "./config";
import { containsFailedStep, deriveNextSteps } from "./steps";

type InvestigationClient = ReturnType<typeof createAdminClient>;

export type InvestigationTurnInput = {
  input: AiIntakeInput;
  provider: AiProvider;
  allowedSlugs: string[];
  ticketId?: string;
  organizationId?: string | null;
  userId?: string;
  persist?: boolean;
  admin?: InvestigationClient;
};

export type InvestigationTurnResult = IntakeResult & {
  turnId?: number;
};

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
  let output = result.output;
  if (result.output.matchedIssueSlug) {
    const issue = ISSUES.find(
      (candidate) => candidate.id === result.output.matchedIssueSlug
    );
    if (issue) {
      const nextSteps = deriveNextSteps(issue, failedSteps);
      output = { ...result.output, nextSteps };
      if (nextSteps.length === 0) {
        output = {
          decision: "escalate",
          escalationReason:
            "All approved steps for the matching guide were already tried.",
          confidence: output.confidence,
          hypotheses: output.hypotheses,
          nextSteps: [],
        };
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
