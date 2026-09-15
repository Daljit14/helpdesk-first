import { beforeEach, describe, expect, test, vi } from "vitest";
import { checkPilotEligibility } from "./pilot";

type PilotAdmin = Parameters<typeof checkPilotEligibility>[0];

function admin(count: number, error: Error | null = null): PilotAdmin {
  const from = vi.fn(() => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "gte"]) {
      chain[method] = () => chain;
    }
    chain.then = (...args: unknown[]) => {
      const resolve = args[0];
      const result = { data: [], count, error };
      if (typeof resolve !== "function") return Promise.resolve(result);
      const resolveResult = resolve as (value: typeof result) => unknown;
      return Promise.resolve(result).then(resolveResult);
    };
    return chain;
  });
  return { from } as unknown as PilotAdmin;
}

describe("pilot eligibility", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", "org-1");
  });

  test("fails closed when the organization is not allow-listed", async () => {
    const result = await checkPilotEligibility(admin(0), {
      organizationId: "org-2",
      capability: { id: "safe", version: 1, riskLevel: "safe" },
    });
    expect(result).toEqual({
      ok: false,
      code: "pilot_org_not_allowlisted",
    });
  });

  test("allows safe capabilities when no capability list is configured", async () => {
    await expect(
      checkPilotEligibility(admin(0), {
        organizationId: "org-1",
        capability: { id: "safe", version: 1, riskLevel: "safe" },
      })
    ).resolves.toEqual({ ok: true });
    await expect(
      checkPilotEligibility(admin(0), {
        organizationId: "org-1",
        capability: { id: "caution", version: 1, riskLevel: "caution" },
      })
    ).resolves.toEqual({ ok: false, code: "pilot_capability_risk" });
  });

  test("requires listed capabilities when an explicit list is configured", async () => {
    vi.stubEnv("HELP_DESK_PILOT_CAPABILITY_ALLOWLIST", "listed");
    await expect(
      checkPilotEligibility(admin(0), {
        organizationId: "org-1",
        capability: { id: "other", version: 1, riskLevel: "safe" },
      })
    ).resolves.toEqual({
      ok: false,
      code: "pilot_capability_not_allowlisted",
    });
  });

  test("enforces global and organization daily limits", async () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_DAILY_EXECUTION_LIMIT", "2");
    await expect(
      checkPilotEligibility(admin(2), {
        organizationId: "org-1",
        capability: { id: "safe", version: 1, riskLevel: "safe" },
      })
    ).resolves.toEqual({ ok: false, code: "pilot_daily_limit" });
    vi.stubEnv("HELP_DESK_AUTONOMY_DAILY_EXECUTION_LIMIT", "20");
    vi.stubEnv("HELP_DESK_PILOT_ORG_DAILY_EXECUTION_LIMIT", "2");
    await expect(
      checkPilotEligibility(admin(2), {
        organizationId: "org-1",
        capability: { id: "safe", version: 1, riskLevel: "safe" },
      })
    ).resolves.toEqual({ ok: false, code: "pilot_org_daily_limit" });
  });

  test("treats count query errors as global daily-limit denials", async () => {
    await expect(
      checkPilotEligibility(admin(0, new Error("database unavailable")), {
        organizationId: "org-1",
        capability: { id: "safe", version: 1, riskLevel: "safe" },
      })
    ).resolves.toEqual({ ok: false, code: "pilot_daily_limit" });
  });
});
