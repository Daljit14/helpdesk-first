import { getAllIssueSlugs } from "@/lib/search";
import { platforms } from "@/lib/helpdesk-data";
import {
  diagnosticQuestions,
  type AiIntakeInput,
  type AiIntakeOutput,
  type AiProvider,
  type DiagnosticQuestion,
} from "./types";
import {
  checkUserMessageSafety,
  isAiEnabled,
  validateAndCoerceOutput,
  validateAiOutput,
  type AiAvailability,
  type UserMessageSafety,
} from "./safety-policy";

export type IntakeResult =
  | {
      status: "success";
      output: AiIntakeOutput;
    }
  | {
      status: "unavailable";
      reason: string;
    }
  | {
      status: "unsafe";
      category: string;
      reason: string;
    };

export type IntakeEngineOptions = {
  provider: AiProvider;
  allowedSlugs?: string[];
  allowedQuestions?: DiagnosticQuestion[];
  allowedPlatforms?: readonly string[];
};

export async function processAiIntake(
  input: AiIntakeInput,
  options: IntakeEngineOptions
): Promise<IntakeResult> {
  const availability = isAiEnabled();
  if (!availability.enabled) {
    return {
      status: "unavailable",
      reason: availability.reason ?? "AI intake is disabled.",
    };
  }

  const userSafety = checkUserMessageSafety(input);
  if (!userSafety.allowed) {
    return {
      status: "unsafe",
      category: userSafety.category ?? "unsupported",
      reason:
        userSafety.reason ??
        "This request cannot be handled by the support assistant.",
    };
  }

  const { provider } = options;

  let rawOutput: AiIntakeOutput;
  try {
    rawOutput = await provider.classify(input);
  } catch {
    return {
      status: "unavailable",
      reason:
        "The support assistant is temporarily unavailable. Please use the search page.",
    };
  }

  const allowedSlugs = options.allowedSlugs ?? getAllIssueSlugs();
  const allowedQuestions = options.allowedQuestions ?? diagnosticQuestions;
  const allowedPlatforms = options.allowedPlatforms ?? platforms;

  const validation = validateAiOutput(
    rawOutput,
    allowedSlugs,
    allowedQuestions,
    allowedPlatforms
  );
  if (!validation.valid) {
    return {
      status: "unavailable",
      reason:
        "The assistant returned an unsafe or invalid response. Please use the search page.",
    };
  }

  const coerced = validateAndCoerceOutput(
    rawOutput,
    allowedSlugs,
    allowedQuestions,
    allowedPlatforms
  );
  if (!coerced) {
    return {
      status: "unavailable",
      reason:
        "The assistant response could not be safely validated. Please use the search page.",
    };
  }

  return { status: "success", output: coerced };
}

export type { AiAvailability, UserMessageSafety };
export {
  checkUserMessageSafety,
  isAiEnabled,
  validateAiOutput,
  validateAndCoerceOutput,
};
