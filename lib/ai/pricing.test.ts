import { describe, expect, test } from "vitest";
import { costMicros, priceForModel } from "./pricing";

describe("model pricing", () => {
  test("prices Haiku 4.5 input and output tokens in micros", () => {
    expect(
      costMicros("claude-haiku-4-5", {
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      })
    ).toBe(3500);
  });

  test("prices cache writes and reads at their model-specific rates", () => {
    expect(
      costMicros("claude-haiku-4-5-20251001", {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 100,
        cacheReadInputTokens: 200,
      })
    ).toBe(145);
  });

  test("matches dated model ids by prefix", () => {
    expect(priceForModel("claude-haiku-4-5-20251001")).toEqual({
      price: { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 },
      known: true,
    });
  });

  test.each([
    ["claude-sonnet-4-5-20250929", 3, 3.75, 0.3, 15],
    ["claude-sonnet-4-6-20260101", 3, 3.75, 0.3, 15],
    ["claude-sonnet-5", 2, 2.5, 0.2, 10],
    ["claude-opus-4-5-20251001", 5, 6.25, 0.5, 25],
    ["claude-opus-4-6-20260101", 5, 6.25, 0.5, 25],
    ["claude-opus-4-7", 5, 6.25, 0.5, 25],
    ["claude-opus-4-8", 5, 6.25, 0.5, 25],
    ["claude-opus-5", 5, 6.25, 0.5, 25],
  ] as const)(
    "matches configured pricing for model prefix %s",
    (model, input, cacheWrite, cacheRead, output) => {
      expect(priceForModel(model)).toEqual({
        price: { input, cacheWrite, cacheRead, output },
        known: true,
      });
    }
  );

  test("uses a conservative fallback for unknown models", () => {
    expect(priceForModel("claude-new-model")).toEqual({
      price: { input: 10, cacheWrite: 12.5, cacheRead: 1, output: 50 },
      known: false,
    });
    expect(
      costMicros("unknown", {
        inputTokens: 1,
        outputTokens: 1,
        cacheCreationInputTokens: 1,
        cacheReadInputTokens: 1,
      })
    ).toBe(74);
  });
});
