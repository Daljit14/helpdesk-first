import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("daily AI budget", () => {
  beforeEach(() => {
    process.env.HELP_DESK_AI_RATE_LIMIT_PROVIDER = "memory";
    vi.resetModules();
  });

  afterEach(() => vi.unstubAllEnvs());

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

  test("allows any spend when the organization cap is zero", async () => {
    vi.stubEnv("HELP_DESK_AI_ORG_DAILY_COST_CAP_USD", "0");
    const { checkOrgDailyCostBudget } = await import("./budget");
    const admin = { rpc: vi.fn() };

    await expect(
      checkOrgDailyCostBudget(admin as never, "org-1")
    ).resolves.toBe(true);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  test("fails closed when the organization budget RPC errors", async () => {
    vi.stubEnv("HELP_DESK_AI_ORG_DAILY_COST_CAP_USD", "10");
    const { checkOrgDailyCostBudget } = await import("./budget");
    const admin = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error("offline") }),
    };

    await expect(
      checkOrgDailyCostBudget(admin as never, "org-1")
    ).resolves.toBe(false);
    expect(admin.rpc).toHaveBeenCalledWith("agent_org_cost_today", {
      p_organization_id: "org-1",
    });
  });

  test("allows spend below the cap and rejects spend at or above it", async () => {
    vi.stubEnv("HELP_DESK_AI_ORG_DAILY_COST_CAP_USD", "10");
    const { checkOrgDailyCostBudget } = await import("./budget");
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: 9_999_999, error: null }),
    };

    await expect(
      checkOrgDailyCostBudget(admin as never, "org-1")
    ).resolves.toBe(true);
    admin.rpc.mockResolvedValue({ data: 10_000_000, error: null });
    await expect(
      checkOrgDailyCostBudget(admin as never, "org-1")
    ).resolves.toBe(false);
    admin.rpc.mockResolvedValue({ data: 10_000_001, error: null });
    await expect(
      checkOrgDailyCostBudget(admin as never, "org-1")
    ).resolves.toBe(false);
  });

  test("fails closed when the RPC result is not a number or it throws", async () => {
    vi.stubEnv("HELP_DESK_AI_ORG_DAILY_COST_CAP_USD", "10");
    const { checkOrgDailyCostBudget } = await import("./budget");
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: "1", error: null }),
    };

    await expect(
      checkOrgDailyCostBudget(admin as never, "org-1")
    ).resolves.toBe(false);
    admin.rpc.mockRejectedValue(new Error("offline"));
    await expect(
      checkOrgDailyCostBudget(admin as never, "org-1")
    ).resolves.toBe(false);
  });
});
