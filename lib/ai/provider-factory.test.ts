import { afterEach, describe, expect, test, vi } from "vitest";
import { createConfiguredAiProvider } from "./provider-factory";

afterEach(() => {
  delete process.env.HELP_DESK_AI_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HELP_DESK_AI_DAILY_CALL_BUDGET;
  vi.restoreAllMocks();
});

describe("createConfiguredAiProvider", () => {
  test.each([
    ["mock", "mock"],
    ["invalid", "mock"],
    [undefined, "mock"],
  ])("uses the mock provider for %s", async (kind, _expected) => {
    void _expected;
    if (kind === undefined) delete process.env.HELP_DESK_AI_PROVIDER;
    else process.env.HELP_DESK_AI_PROVIDER = kind;
    const provider = createConfiguredAiProvider({
      allowedSlugs: ["slow-computer"],
    });
    await expect(
      provider.classify({ message: "slow computer", platform: "Windows" })
    ).resolves.toMatchObject({
      decision: "match",
      matchedIssueSlug: "slow-computer",
    });
  });

  test("falls back to mock without an Anthropic key and warns once", async () => {
    process.env.HELP_DESK_AI_PROVIDER = "anthropic";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = createConfiguredAiProvider();
    const second = createConfiguredAiProvider();
    await expect(
      first.classify({ message: "slow computer", platform: "Windows" })
    ).resolves.toMatchObject({ decision: "match" });
    await expect(
      second.classify({ message: "slow computer", platform: "Windows" })
    ).resolves.toMatchObject({ decision: "match" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("without ANTHROPIC_API_KEY")
    );
  });

  test("constructs shadow mode without making a network call", async () => {
    process.env.HELP_DESK_AI_PROVIDER = "shadow";
    const provider = createConfiguredAiProvider({
      allowedSlugs: ["slow-computer"],
    });
    await expect(
      provider.classify({ message: "slow computer", platform: "Windows" })
    ).resolves.toMatchObject({
      decision: "match",
      matchedIssueSlug: "slow-computer",
    });
  });
});
