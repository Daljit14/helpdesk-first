import { platforms, type Platform } from "@/lib/helpdesk-data";
import { diagnosticQuestions, type DiagnosticAnswer } from "./types";

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_ANSWER_LENGTH = 500;
export const MAX_DIAGNOSTIC_ANSWERS = 3;
export const MAX_CUMULATIVE_TEXT_LENGTH = 2000;

const ALLOWED_REQUEST_FIELDS = new Set([
  "message",
  "platform",
  "previousAnswers",
]);
const ALLOWED_ANSWER_FIELDS = new Set(["questionId", "answer"]);

const diagnosticQuestionIds = new Set(diagnosticQuestions.map((q) => q.id));

export type ValidatedIntakeRequest = {
  message: string;
  platform: Platform | null;
  previousAnswers: DiagnosticAnswer[];
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
  | "PLATFORM_TYPE_INVALID";

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

  const { message, platform, previousAnswers } = request;

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
    },
  };
}
