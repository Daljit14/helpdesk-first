import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  sync: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isCapabilityRegistryEnabled: mocks.enabled,
}));
vi.mock("@/lib/autonomy/capabilities/sync", () => ({
  syncCapabilityRegistry: mocks.sync,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("capability registry sync cron", () => {
  test("rejects missing and incorrect bearer secrets", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    await expect(
      GET(new Request("http://localhost/api/cron/capability-registry-sync"))
    ).resolves.toHaveProperty("status", 401);
    await expect(
      GET(
        new Request("http://localhost/api/cron/capability-registry-sync", {
          headers: { Authorization: "Bearer wrong-secret" },
        })
      )
    ).resolves.toHaveProperty("status", 401);
  });

  test("returns skipped when the registry flag is disabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.enabled.mockReturnValue(false);
    const response = await GET(
      new Request("http://localhost/api/cron/capability-registry-sync", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ skipped: true });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("runs synchronization when enabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.enabled.mockReturnValue(true);
    const result = { inserted: 11, updated: 0, deprecated: 0, conflicts: [] };
    mocks.sync.mockResolvedValue(result);
    const admin = {};
    mocks.createAdminClient.mockReturnValue(admin);
    const response = await GET(
      new Request("http://localhost/api/cron/capability-registry-sync", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(mocks.sync).toHaveBeenCalledWith(admin);
  });

  test("returns 500 when synchronization fails", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.enabled.mockReturnValue(true);
    mocks.sync.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(
      new Request("http://localhost/api/cron/capability-registry-sync", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Capability registry sync failed.",
    });
  });
});
