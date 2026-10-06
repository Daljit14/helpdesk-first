import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  createAdminClient: vi.fn(),
  setKillSwitch: vi.fn(),
  revalidatePath: vi.fn(),
  limiterCheck: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/autonomy/kill-switches", () => ({
  setKillSwitch: mocks.setKillSwitch,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: () => ({ check: mocks.limiterCheck }),
  getRateLimitConfig: () => ({ windowMs: 60_000, maxRequests: 30 }),
}));
vi.mock("./admin-pilot-limiter", () => ({
  pilotActionLimiter: { check: mocks.limiterCheck },
}));

import { clearBlastRadiusStopAction } from "./admin-blast-radius";

const platformAdmin = {
  userId: "platform-1",
  email: "platform@example.com",
  role: "org_admin" as const,
  organizationId: "org-1",
  displayName: "Platform",
  isPlatformAdmin: true,
};

function form(scope: "capability" | "global", scopeId = "") {
  const value = new FormData();
  value.set("scope", scope);
  value.set("scopeId", scopeId);
  return value;
}

function query(data: unknown) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "is"]) chain[method] = () => chain;
  chain.maybeSingle = async () => ({ data, error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminSession.mockResolvedValue(platformAdmin);
  mocks.limiterCheck.mockResolvedValue({ allowed: true });
  mocks.setKillSwitch.mockResolvedValue({ ok: true });
  mocks.createAdminClient.mockReturnValue({
    from: () => query(null),
  });
});

describe("clearBlastRadiusStopAction", () => {
  test("rejects non-platform admins", async () => {
    mocks.getAdminSession.mockResolvedValue({
      ...platformAdmin,
      isPlatformAdmin: false,
    });
    await expect(clearBlastRadiusStopAction(form("global"))).resolves.toEqual({
      error: "Platform admin access required.",
    });
    expect(mocks.setKillSwitch).not.toHaveBeenCalled();
  });

  test("preserves non-blast-radius reasons", async () => {
    mocks.createAdminClient.mockReturnValue({
      from: () =>
        query({ id: "switch-1", enabled: true, reason: "manual_stop" }),
    });
    await expect(
      clearBlastRadiusStopAction(form("capability", "cap-a"))
    ).resolves.toEqual({
      error: "Automatic blast-radius stop is not active.",
    });
    expect(mocks.setKillSwitch).not.toHaveBeenCalled();
  });

  test("clears an active automatic stop and revalidates guardrails", async () => {
    mocks.createAdminClient.mockReturnValue({
      from: () =>
        query({
          id: "switch-1",
          enabled: true,
          reason: "blast_radius:threshold",
        }),
    });
    await expect(
      clearBlastRadiusStopAction(form("capability", "cap-a"))
    ).resolves.toEqual({ success: true });
    expect(mocks.setKillSwitch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scope: "capability",
        scopeId: "cap-a",
        enabled: false,
        reason: "blast_radius_cleared",
        setBy: "platform-1",
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/resolution/guardrails"
    );
  });
});
