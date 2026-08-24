import { describe, expect, test } from "vitest";
import {
  MAX_ANSWER_LENGTH,
  MAX_CUMULATIVE_TEXT_LENGTH,
  MAX_DIAGNOSTIC_ANSWERS,
  MAX_MESSAGE_LENGTH,
  SAFE_ERROR_MESSAGES,
  validateApiRequest,
} from "./validation";

describe("validateApiRequest", () => {
  test("accepts a minimal valid request", () => {
    const result = validateApiRequest({ message: "printer offline" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.message).toBe("printer offline");
    expect(result.data.platform).toBeNull();
    expect(result.data.previousAnswers).toEqual([]);
  });

  test("accepts a valid platform", () => {
    const result = validateApiRequest({
      message: "slow computer",
      platform: "Windows",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.platform).toBe("Windows");
  });

  test("rejects invalid platform", () => {
    const result = validateApiRequest({
      message: "slow computer",
      platform: "Linux",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("INVALID_PLATFORM");
  });

  test("rejects wrong platform type", () => {
    const result = validateApiRequest({
      message: "slow computer",
      platform: 123,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("PLATFORM_TYPE_INVALID");
  });

  test("rejects null platform only as valid", () => {
    const result = validateApiRequest({
      message: "slow computer",
      platform: null,
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty message", () => {
    const result = validateApiRequest({ message: "   " });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("MESSAGE_EMPTY");
  });

  test("rejects oversized message", () => {
    const result = validateApiRequest({
      message: "x".repeat(MAX_MESSAGE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("MESSAGE_TOO_LONG");
  });

  test("rejects oversized answer", () => {
    const result = validateApiRequest({
      message: "printer offline",
      previousAnswers: [
        {
          questionId: "which-platform",
          answer: "x".repeat(MAX_ANSWER_LENGTH + 1),
        },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((e) => e.code === "ANSWER_TOO_LONG")).toBe(true);
  });

  test("rejects too many answers", () => {
    const result = validateApiRequest({
      message: "a",
      previousAnswers: [
        { questionId: "which-platform", answer: "Windows" },
        { questionId: "where-happens", answer: "Outlook" },
        { questionId: "when-started", answer: "today" },
        { questionId: "error-message", answer: "none" },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("TOO_MANY_ANSWERS");
  });

  test("rejects unknown question ID", () => {
    const result = validateApiRequest({
      message: "a",
      previousAnswers: [{ questionId: "bogus-id", answer: "b" }],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("UNKNOWN_QUESTION_ID");
  });

  test("rejects duplicate question IDs", () => {
    const result = validateApiRequest({
      message: "a",
      previousAnswers: [
        { questionId: "which-platform", answer: "Windows" },
        { questionId: "which-platform", answer: "Mac" },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((e) => e.code === "DUPLICATE_QUESTION_ID")).toBe(
      true
    );
  });

  test("rejects unexpected request property", () => {
    const result = validateApiRequest({
      message: "a",
      extraField: "should not be here",
    } as Record<string, unknown>);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("UNKNOWN_FIELD");
  });

  test("rejects unexpected answer property", () => {
    const result = validateApiRequest({
      message: "a",
      previousAnswers: [
        { questionId: "which-platform", answer: "Windows", extra: 1 },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("UNKNOWN_FIELD");
  });

  test("rejects oversized total request", () => {
    const message = "x".repeat(MAX_MESSAGE_LENGTH);
    const answer = "y".repeat(MAX_ANSWER_LENGTH);
    const result = validateApiRequest({
      message,
      previousAnswers: [
        { questionId: "which-platform", answer },
        { questionId: "where-happens", answer },
        { questionId: "when-started", answer },
      ],
    });
    const total = message.length + answer.length * 3;
    expect(total).toBeGreaterThan(MAX_CUMULATIVE_TEXT_LENGTH);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("CUMULATIVE_TEXT_TOO_LONG");
  });

  test("rejects malformed previousAnswers", () => {
    const result = validateApiRequest({
      message: "a",
      previousAnswers: "not-an-array",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors[0]?.code).toBe("INVALID_ANSWER_SHAPE");
  });

  test("does not echo user content in error messages", () => {
    const result = validateApiRequest({
      message: "x".repeat(MAX_MESSAGE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    const errorMessages = (
      result as { success: false; errors: { message: string }[] }
    ).errors.map((e) => e.message);
    expect(errorMessages.join(" ")).not.toContain("x".repeat(10));
    expect(
      errorMessages.every((m) => m === SAFE_ERROR_MESSAGES.MESSAGE_TOO_LONG)
    ).toBe(true);
  });

  test("enforces maximum of three diagnostic answers", () => {
    const result = validateApiRequest({
      message: "a",
      previousAnswers: Array.from(
        { length: MAX_DIAGNOSTIC_ANSWERS + 1 },
        (_, i) => ({
          questionId:
            i === 0
              ? "which-platform"
              : i === 1
                ? "where-happens"
                : "when-started",
          answer: "ok",
        })
      ),
    });
    expect(result.success).toBe(false);
  });
});
