import { beforeEach, describe, expect, test, vi } from "vitest";

describe("daily AI budget", () => {
  beforeEach(() => {
    process.env.HELP_DESK_AI_RATE_LIMIT_PROVIDER = "memory";
    vi.resetModules();
  });

  test("allows calls up to the configured budget", async () => {
    const { checkAndConsumeDailyBudget } = await import("./budget");
    process.env.HELP_DESK_AI_DAILY_CALL_BUDGET = "2";
    expect(await checkAndConsumeDailyBudget()).toBe(true);
    expect(await checkAndConsumeDailyBudget()).toBe(true);
    expect(await checkAndConsumeDailyBudget()).toBe(false);
  });

  test("zero disables enforcement", async () => {
    const { checkAndConsumeDailyBudget } = await import("./budget");
    process.env.HELP_DESK_AI_DAILY_CALL_BUDGET = "0";
    expect(await checkAndConsumeDailyBudget()).toBe(true);
    expect(await checkAndConsumeDailyBudget()).toBe(true);
  });

  test("falls back to the default budget for invalid values", async () => {
    const { checkAndConsumeDailyBudget } = await import("./budget");
    process.env.HELP_DESK_AI_DAILY_CALL_BUDGET = "-1";
    expect(await checkAndConsumeDailyBudget()).toBe(true);
  });
});
