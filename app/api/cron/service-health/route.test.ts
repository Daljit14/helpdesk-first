import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  isServiceHealthEnabled: vi.fn(),
  notifyRestoredOutages: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isServiceHealthEnabled: mocks.isServiceHealthEnabled,
}));
vi.mock("@/lib/service-health/restore", () => ({
  notifyRestoredOutages: mocks.notifyRestoredOutages,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("service-health cron", () => {
  test("rejects requests without the configured cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const response = await GET(
      new Request("http://localhost/api/cron/service-health")
    );
    expect(response.status).toBe(401);
  });

  test("skips restoration when service health is disabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.isServiceHealthEnabled.mockReturnValue(false);
    const response = await GET(
      new Request("http://localhost/api/cron/service-health", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ skipped: true });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("runs the bounded restoration worker when enabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.isServiceHealthEnabled.mockReturnValue(true);
    mocks.createAdminClient.mockReturnValue({ id: "admin" });
    mocks.notifyRestoredOutages.mockResolvedValue({
      checked: 3,
      notified: 1,
    });
    const response = await GET(
      new Request("http://localhost/api/cron/service-health", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checked: 3,
      notified: 1,
    });
    expect(mocks.notifyRestoredOutages).toHaveBeenCalledWith({
      id: "admin",
    });
  });
});
