import { classifyStep } from "@/lib/investigation/policy";
import {
  LEARNING_PROMPT_VERSION,
  type LearnedArticle,
} from "@/lib/knowledge/learning-article";

/**
 * Redacted, structured input handed to a learned-article provider. Only the
 * fields below leave the application boundary; raw conversation history,
 * internal notes and attachments are never included.
 */
export type LearnedArticleInput = {
  ticketId: string;
  problem: string;
  symptoms: string[];
  platform: string | null;
  relatedSlug: string | null;
  relatedTitle: string | null;
  rootCause: string;
  actionsPerformed: string;
  toolsUsed: string;
  preventive: string;
  failedGuideSteps: number[];
  reviewerInstructions: string | null;
};

export type LearnedArticleProvider = {
  name: string;
  version: string;
  promptVersion: string;
  generate(input: LearnedArticleInput): Promise<unknown>;
};

function splitSteps(value: string): string[] {
  return value
    .split(/\r?\n|\d+[.)]\s|;/)
    .map((step) => step.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((step) => step.length > 2)
    .slice(0, 12);
}

function firstSentence(value: string): string {
  return value.split(/[.!?](?:\s|$)/, 1)[0]?.trim() || value;
}

function sentences(value: string, max: number): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Deterministic provider: builds the article purely from the structured
 * resolution report. No model call, no external transfer. Used as the default
 * and as the safe fallback when a model provider is unavailable.
 */
export const deterministicLearnedArticleProvider: LearnedArticleProvider = {
  name: "deterministic",
  version: "1",
  promptVersion: LEARNING_PROMPT_VERSION,
  async generate(input): Promise<LearnedArticle> {
    const steps = splitSteps(input.actionsPerformed).map((text) => ({
      text,
      risk: classifyStep(text).risk,
    }));
    const platforms = input.platform ? [input.platform] : [];
    const title = input.relatedTitle
      ? `${input.relatedTitle}: ${firstSentence(input.rootCause)}`
      : firstSentence(input.rootCause);
    return {
      title: title.slice(0, 160),
      problemSummary: input.problem.slice(0, 600),
      symptoms: input.symptoms.slice(0, 8),
      platforms,
      rootCause: input.rootCause.slice(0, 600),
      preconditions: [
        ...(input.toolsUsed
          ? [`Access to ${input.toolsUsed}`.slice(0, 300)]
          : []),
        ...(input.failedGuideSteps.length && input.relatedSlug
          ? [
              `Steps ${input.failedGuideSteps.map((index) => index + 1).join(", ")} of the "${input.relatedSlug}" guide did not resolve the issue.`,
            ]
          : []),
      ],
      steps: steps.length
        ? steps
        : [
            {
              text: input.actionsPerformed.slice(0, 400),
              risk: classifyStep(input.actionsPerformed).risk,
            },
          ],
      verification: [
        "Ask the user to repeat the action that originally failed and confirm the symptom no longer occurs.",
      ],
      escalationConditions: [
        "The symptom returns after completing these steps.",
        "Any step requires permissions the user does not have.",
      ],
      prevention: sentences(input.preventive, 3),
      sources: [
        { type: "ticket", reference: input.ticketId },
        ...(input.relatedSlug
          ? [{ type: "guide" as const, reference: input.relatedSlug }]
          : []),
      ],
      confidence: input.relatedSlug ? 0.7 : 0.55,
      securityReviewRequired: false,
    };
  },
};

export function getLearnedArticleProvider(): LearnedArticleProvider {
  return deterministicLearnedArticleProvider;
}
