import { platforms, type Platform } from "@/lib/helpdesk-data";
import {
  diagnosticQuestions,
  type DiagnosticAnswer,
  type InvestigationContext,
  type StepRef,
} from "./types";

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_ANSWER_LENGTH = 500;
export const MAX_DIAGNOSTIC_ANSWERS = 3;
export const MAX_CUMULATIVE_TEXT_LENGTH = 2000;

const ALLOWED_REQUEST_FIELDS = new Set([
  "message",
  "platform",
  "previousAnswers",
  "context",
  "failedSteps",
]);
const ALLOWED_ANSWER_FIELDS = new Set(["questionId", "answer"]);
const ALLOWED_CONTEXT_FIELDS = new Set(["os", "device", "app", "userRole"]);
const ALLOWED_STEP_FIELDS = new Set(["guideSlug", "stepIndex"]);
const MAX_CONTEXT_LENGTH = 80;
const MAX_FAILED_STEPS = 20;

const diagnosticQuestionIds = new Set(diagnosticQuestions.map((q) => q.id));

export type ValidatedIntakeRequest = {
  message: string;
  platform: Platform | null;
  previousAnswers: DiagnosticAnswer[];
  context?: InvestigationContext;
  failedSteps?: StepRef[];
};

export type ValidationErrorCode =
  | "INVALID_JSON"
  | "INVALID_BODY"
  | "UNKNOWN_FIELD"
  | "MESSAGE_EMPTY"
  | "MESSAGE_TOO_LONG"
  | "ANSWER_TOO_LONG"
  | "TOO_MANY_ANSWERS"
  | "CUMULATIVE_TEXT_TOO_LONG"
  | "INVALID_PLATFORM"
  | "INVALID_ANSWER_SHAPE"
  | "UNKNOWN_QUESTION_ID"
  | "DUPLICATE_QUESTION_ID"
  | "PLATFORM_TYPE_INVALID"
  | "INVALID_CONTEXT"
  | "CONTEXT_VALUE_TOO_LONG"
  | "INVALID_FAILED_STEPS";

export type RequestValidationError = {
  code: ValidationErrorCode;
  field: string;
  message: string;
};

export const SAFE_ERROR_MESSAGES: Record<ValidationErrorCode, string> = {
  INVALID_JSON: "The request body is not valid JSON.",
  INVALID_BODY: "The request body must be an object.",
  UNKNOWN_FIELD: "The request contains an unexpected field.",
  MESSAGE_EMPTY: "A problem description is required.",
  MESSAGE_TOO_LONG: "The problem description is too long.",
  ANSWER_TOO_LONG: "A diagnostic answer is too long.",
  TOO_MANY_ANSWERS: "Too many diagnostic answers were provided.",
  CUMULATIVE_TEXT_TOO_LONG:
    "The total length of the problem and answers is too long.",
  INVALID_PLATFORM: "The platform is not supported.",
  INVALID_ANSWER_SHAPE: "A diagnostic answer is malformed.",
  UNKNOWN_QUESTION_ID: "A diagnostic question ID is not recognized.",
  DUPLICATE_QUESTION_ID: "A diagnostic question was provided more than once.",
  PLATFORM_TYPE_INVALID: "The platform value must be a string or null.",
  INVALID_CONTEXT: "The investigation context is malformed.",
  CONTEXT_VALUE_TOO_LONG: "An investigation context value is too long.",
  INVALID_FAILED_STEPS: "A failed investigation step is malformed.",
};

export function isValidPlatform(value: string): value is Platform {
  return platforms.includes(value as Platform);
}

export function validateApiRequest(
  body: unknown
):
  | { success: true; data: ValidatedIntakeRequest }
  | { success: false; errors: RequestValidationError[] } {
  const errors: RequestValidationError[] = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      success: false,
      errors: [
        {
          code: "INVALID_BODY",
          field: "body",
          message: SAFE_ERROR_MESSAGES.INVALID_BODY,
        },
      ],
    };
  }

  const request = body as Record<string, unknown>;

  for (const key of Object.keys(request)) {
    if (!ALLOWED_REQUEST_FIELDS.has(key)) {
      errors.push({
        code: "UNKNOWN_FIELD",
        field: key,
        message: SAFE_ERROR_MESSAGES.UNKNOWN_FIELD,
      });
    }
  }

  const { message, platform, previousAnswers, context, failedSteps } = request;

  if (typeof message !== "string" || message.trim().length === 0) {
    errors.push({
      code: "MESSAGE_EMPTY",
      field: "message",
      message: SAFE_ERROR_MESSAGES.MESSAGE_EMPTY,
    });
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.push({
      code: "MESSAGE_TOO_LONG",
      field: "message",
      message: SAFE_ERROR_MESSAGES.MESSAGE_TOO_LONG,
    });
  }

  let validatedPlatform: Platform | null = null;
  if (platform !== null && platform !== undefined) {
    if (typeof platform !== "string") {
      errors.push({
        code: "PLATFORM_TYPE_INVALID",
        field: "platform",
        message: SAFE_ERROR_MESSAGES.PLATFORM_TYPE_INVALID,
      });
    } else if (!isValidPlatform(platform)) {
      errors.push({
        code: "INVALID_PLATFORM",
        field: "platform",
        message: SAFE_ERROR_MESSAGES.INVALID_PLATFORM,
      });
    } else {
      validatedPlatform = platform as Platform;
    }
  }

  const validatedAnswers: DiagnosticAnswer[] = [];
  const seenQuestionIds = new Set<string>();

  if (previousAnswers !== undefined) {
    if (!Array.isArray(previousAnswers)) {
      errors.push({
        code: "INVALID_ANSWER_SHAPE",
        field: "previousAnswers",
        message: SAFE_ERROR_MESSAGES.INVALID_ANSWER_SHAPE,
      });
    } else {
      if (previousAnswers.length > MAX_DIAGNOSTIC_ANSWERS) {
        errors.push({
          code: "TOO_MANY_ANSWERS",
          field: "previousAnswers",
          message: SAFE_ERROR_MESSAGES.TOO_MANY_ANSWERS,
        });
      }

      for (const [index, answer] of previousAnswers.entries()) {
        if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
          errors.push({
            code: "INVALID_ANSWER_SHAPE",
            field: `previousAnswers[${index}]`,
            message: SAFE_ERROR_MESSAGES.INVALID_ANSWER_SHAPE,
          });
          continue;
        }

        const answerObj = answer as Record<string, unknown>;
        for (const key of Object.keys(answerObj)) {
          if (!ALLOWED_ANSWER_FIELDS.has(key)) {
            errors.push({
              code: "UNKNOWN_FIELD",
              field: `previousAnswers[${index}].${key}`,
              message: SAFE_ERROR_MESSAGES.UNKNOWN_FIELD,
            });
          }
        }

        const { questionId, answer: answerText } = answerObj;

        if (typeof questionId !== "string" || typeof answerText !== "string") {
          errors.push({
            code: "INVALID_ANSWER_SHAPE",
            field: `previousAnswers[${index}]`,
            message: SAFE_ERROR_MESSAGES.INVALID_ANSWER_SHAPE,
          });
          continue;
        }

        if (answerText.length > MAX_ANSWER_LENGTH) {
          errors.push({
            code: "ANSWER_TOO_LONG",
            field: `previousAnswers[${index}].answer`,
            message: SAFE_ERROR_MESSAGES.ANSWER_TOO_LONG,
          });
        }

        if (!diagnosticQuestionIds.has(questionId)) {
          errors.push({
            code: "UNKNOWN_QUESTION_ID",
            field: `previousAnswers[${index}].questionId`,
            message: SAFE_ERROR_MESSAGES.UNKNOWN_QUESTION_ID,
          });
        } else if (seenQuestionIds.has(questionId)) {
          errors.push({
            code: "DUPLICATE_QUESTION_ID",
            field: `previousAnswers[${index}].questionId`,
            message: SAFE_ERROR_MESSAGES.DUPLICATE_QUESTION_ID,
          });
        } else {
          seenQuestionIds.add(questionId);
          validatedAnswers.push({ questionId, answer: answerText.trim() });
        }
      }
    }
  }

  let validatedContext: InvestigationContext | undefined;
  if (context !== undefined) {
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      errors.push({
        code: "INVALID_CONTEXT",
        field: "context",
        message: SAFE_ERROR_MESSAGES.INVALID_CONTEXT,
      });
    } else {
      const contextObject = context as Record<string, unknown>;
      for (const key of Object.keys(contextObject)) {
        if (!ALLOWED_CONTEXT_FIELDS.has(key)) {
          errors.push({
            code: "UNKNOWN_FIELD",
            field: `context.${key}`,
            message: SAFE_ERROR_MESSAGES.UNKNOWN_FIELD,
          });
        }
      }
      const nextContext: InvestigationContext = {};
      for (const key of ALLOWED_CONTEXT_FIELDS) {
        const value = contextObject[key];
        if (value === undefined) continue;
        if (typeof value !== "string") {
          errors.push({
            code: "INVALID_CONTEXT",
            field: `context.${key}`,
            message: SAFE_ERROR_MESSAGES.INVALID_CONTEXT,
          });
        } else if (value.length > MAX_CONTEXT_LENGTH) {
          errors.push({
            code: "CONTEXT_VALUE_TOO_LONG",
            field: `context.${key}`,
            message: SAFE_ERROR_MESSAGES.CONTEXT_VALUE_TOO_LONG,
          });
        } else {
          nextContext[key as keyof InvestigationContext] = value.trim();
        }
      }
      validatedContext = nextContext;
    }
  }

  let validatedFailedSteps: StepRef[] | undefined;
  if (failedSteps !== undefined) {
    if (!Array.isArray(failedSteps) || failedSteps.length > MAX_FAILED_STEPS) {
      errors.push({
        code: "INVALID_FAILED_STEPS",
        field: "failedSteps",
        message: SAFE_ERROR_MESSAGES.INVALID_FAILED_STEPS,
      });
    } else {
      validatedFailedSteps = [];
      for (const [index, step] of failedSteps.entries()) {
        if (!step || typeof step !== "object" || Array.isArray(step)) {
          errors.push({
            code: "INVALID_FAILED_STEPS",
            field: `failedSteps[${index}]`,
            message: SAFE_ERROR_MESSAGES.INVALID_FAILED_STEPS,
          });
          continue;
        }
        const stepObject = step as Record<string, unknown>;
        for (const key of Object.keys(stepObject)) {
          if (!ALLOWED_STEP_FIELDS.has(key)) {
            errors.push({
              code: "UNKNOWN_FIELD",
              field: `failedSteps[${index}].${key}`,
              message: SAFE_ERROR_MESSAGES.UNKNOWN_FIELD,
            });
          }
        }
        if (
          typeof stepObject.guideSlug !== "string" ||
          stepObject.guideSlug.length > 120 ||
          !Number.isInteger(stepObject.stepIndex) ||
          (stepObject.stepIndex as number) < 0 ||
          (stepObject.stepIndex as number) > 99
        ) {
          errors.push({
            code: "INVALID_FAILED_STEPS",
            field: `failedSteps[${index}]`,
            message: SAFE_ERROR_MESSAGES.INVALID_FAILED_STEPS,
          });
          continue;
        }
        validatedFailedSteps.push({
          guideSlug: stepObject.guideSlug,
          stepIndex: stepObject.stepIndex as number,
        });
      }
    }
  }

  if (
    typeof message === "string" &&
    Array.isArray(previousAnswers) &&
    previousAnswers.length <= MAX_DIAGNOSTIC_ANSWERS
  ) {
    const totalText =
      message.length +
      previousAnswers.reduce((sum, answer) => {
        if (
          answer &&
          typeof answer === "object" &&
          !Array.isArray(answer) &&
          typeof (answer as Record<string, unknown>).answer === "string"
        ) {
          return sum + (answer as { answer: string }).answer.length;
        }
        return sum;
      }, 0);

    if (totalText > MAX_CUMULATIVE_TEXT_LENGTH) {
      errors.push({
        code: "CUMULATIVE_TEXT_TOO_LONG",
        field: "body",
        message: SAFE_ERROR_MESSAGES.CUMULATIVE_TEXT_TOO_LONG,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      message: (message as string).trim(),
      platform: validatedPlatform,
      previousAnswers: validatedAnswers,
      ...(validatedContext ? { context: validatedContext } : {}),
      ...(validatedFailedSteps ? { failedSteps: validatedFailedSteps } : {}),
    },
  };
}
