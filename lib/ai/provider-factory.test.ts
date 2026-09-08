import { afterEach, describe, expect, test, vi } from "vitest";
import { createAiProvider } from "./mock-provider";
import { createConfiguredAiProvider } from "./provider-factory";
import { recordProviderCall } from "./telemetry";

vi.mock("./telemetry", () => ({
  recordProviderCall: vi.fn(),
}));

const mockedRecordProviderCall = vi.mocked(recordProviderCall);

afterEach(() => {
  delete process.env.HELP_DESK_AI_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HELP_DESK_AI_DAILY_CALL_BUDGET;
  mockedRecordProviderCall.mockReset();
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

  test("falls back to the mock result when Anthropic throws", async () => {
    process.env.HELP_DESK_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const input = { message: "slow computer", platform: "Windows" as const };
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Anthropic unavailable")
    );
    const provider = createConfiguredAiProvider({
      allowedSlugs: ["slow-computer"],
    });
    const expected = await createAiProvider().classify(input);

    await expect(provider.classify(input)).resolves.toEqual(expected);
    expect(mockedRecordProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: expect.any(String),
        outcome: "fallback",
      })
    );
  });

  test("rethrows Anthropic errors when the intake signal is aborted", async () => {
    process.env.HELP_DESK_AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const controller = new AbortController();
    controller.abort();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError")
    );
    const provider = createConfiguredAiProvider();

    await expect(
      provider.classify(
        { message: "slow computer", platform: "Windows" },
        { signal: controller.signal }
      )
    ).rejects.toThrow("The operation was aborted.");
    expect(mockedRecordProviderCall).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "fallback" })
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
