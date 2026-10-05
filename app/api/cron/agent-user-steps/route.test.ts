import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAgentUserStepsEnabled: vi.fn(),
  sweepPendingUserSteps: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isAgentUserStepsEnabled: mocks.isAgentUserStepsEnabled,
}));
vi.mock("@/lib/agent/user-steps-sweep", () => ({
  sweepPendingUserSteps: mocks.sweepPendingUserSteps,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("agent user-step cron", () => {
  test("rejects requests without the configured cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const response = await GET(
      new Request("http://localhost/api/cron/agent-user-steps")
    );
    expect(response.status).toBe(401);
  });

  test("skips when user steps are disabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.isAgentUserStepsEnabled.mockReturnValue(false);
    const response = await GET(
      new Request("http://localhost/api/cron/agent-user-steps", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ skipped: true });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("runs the bounded sweep when enabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.isAgentUserStepsEnabled.mockReturnValue(true);
    mocks.createAdminClient.mockReturnValue({ admin: true });
    mocks.sweepPendingUserSteps.mockResolvedValue({
      sessionsScanned: 2,
      stepsSaved: 1,
      failed: 0,
    });
    const response = await GET(
      new Request("http://localhost/api/cron/agent-user-steps", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionsScanned: 2,
      stepsSaved: 1,
      failed: 0,
    });
    expect(mocks.sweepPendingUserSteps).toHaveBeenCalledWith({
      admin: true,
    });
  });
});
