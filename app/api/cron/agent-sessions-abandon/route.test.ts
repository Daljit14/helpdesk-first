import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAgentAbandonMinutes: vi.fn(),
  isAgentAbandonSweepEnabled: vi.fn(),
  sweepAbandonedSessions: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  getAgentAbandonMinutes: mocks.getAgentAbandonMinutes,
  isAgentAbandonSweepEnabled: mocks.isAgentAbandonSweepEnabled,
}));
vi.mock("@/lib/agent/abandon", () => ({
  sweepAbandonedSessions: mocks.sweepAbandonedSessions,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("agent-sessions-abandon cron", () => {
  test("rejects requests without the configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");

    const response = await GET(
      new Request("http://localhost/api/cron/agent-sessions-abandon")
    );

    expect(response.status).toBe(401);
  });

  test("returns a no-store skipped response while disabled", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.isAgentAbandonSweepEnabled.mockReturnValue(false);

    const response = await GET(
      new Request("http://localhost/api/cron/agent-sessions-abandon", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ skipped: true });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("runs the sweep with the configured age and returns no-store", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.isAgentAbandonSweepEnabled.mockReturnValue(true);
    mocks.getAgentAbandonMinutes.mockReturnValue(90);
    mocks.createAdminClient.mockReturnValue({ id: "admin" });
    mocks.sweepAbandonedSessions.mockResolvedValue({
      scanned: 3,
      abandoned: 2,
      skipped: 1,
    });

    const response = await GET(
      new Request("http://localhost/api/cron/agent-sessions-abandon", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      scanned: 3,
      abandoned: 2,
      skipped: 1,
    });
    expect(mocks.sweepAbandonedSessions).toHaveBeenCalledWith(
      { id: "admin" },
      { now: expect.any(Date), minutes: 90 }
    );
  });

  test("returns 500 if the sweep fails", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mocks.isAgentAbandonSweepEnabled.mockReturnValue(true);
    mocks.getAgentAbandonMinutes.mockReturnValue(60);
    mocks.createAdminClient.mockReturnValue({ id: "admin" });
    mocks.sweepAbandonedSessions.mockRejectedValue(new Error("db failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      new Request("http://localhost/api/cron/agent-sessions-abandon", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Agent session abandonment sweep failed.",
    });
  });
});
