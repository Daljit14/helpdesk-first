import { describe, expect, test, vi } from "vitest";
import { ShadowAiProvider } from "./shadow-provider";
import type { AiProvider } from "./types";

const input = { message: "slow computer", platform: "Windows" as const };
const primaryOutput = {
  decision: "match" as const,
  matchedIssueSlug: "slow-computer",
};

describe("ShadowAiProvider", () => {
  test("returns primary output before shadow completion and compares results", async () => {
    let resolveShadow!: (value: typeof primaryOutput) => void;
    const shadowPromise = new Promise<typeof primaryOutput>((resolve) => {
      resolveShadow = resolve;
    });
    const primary: AiProvider = { classify: vi.fn(async () => primaryOutput) };
    const shadow: AiProvider = {
      classify: vi.fn(() => shadowPromise),
    };
    const onCompare = vi.fn();
    const provider = new ShadowAiProvider(primary, shadow, onCompare);

    await expect(provider.classify(input)).resolves.toEqual(primaryOutput);
    expect(onCompare).not.toHaveBeenCalled();
    resolveShadow(primaryOutput);
    await vi.waitFor(() => expect(onCompare).toHaveBeenCalled());
    expect(onCompare).toHaveBeenCalledWith({
      agreeDecision: true,
      agreeSlug: true,
      primaryDecision: "match",
      shadowDecision: "match",
      shadowError: null,
    });
  });

  test("swallows shadow errors and reports them", async () => {
    const primary: AiProvider = { classify: vi.fn(async () => primaryOutput) };
    const shadow: AiProvider = {
      classify: vi.fn(async () => {
        throw new Error("shadow unavailable");
      }),
    };
    const onCompare = vi.fn();
    await new ShadowAiProvider(primary, shadow, onCompare).classify(input);
    await vi.waitFor(() =>
      expect(onCompare).toHaveBeenCalledWith(
        expect.objectContaining({
          agreeDecision: false,
          shadowDecision: null,
          shadowError: "shadow unavailable",
        })
      )
    );
  });
});
