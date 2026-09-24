import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  authenticateDeviceRequest: vi.fn(),
  isDeviceAgentEnabled: vi.fn(),
  readKillSwitches: vi.fn(),
  resolveJobMode: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/device-agent/server/auth", () => ({
  authenticateDeviceRequest: mocks.authenticateDeviceRequest,
}));
vi.mock("@/lib/admin/flags", () => ({
  isDeviceAgentEnabled: mocks.isDeviceAgentEnabled,
}));
vi.mock("@/lib/autonomy/kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
}));
vi.mock("@/lib/device-agent/server/jobs", () => ({
  resolveJobMode: mocks.resolveJobMode,
}));

import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("device heartbeat route", () => {
  test("reports no kill switch while autonomy is env-disabled", async () => {
    mocks.isDeviceAgentEnabled.mockReturnValue(true);
    mocks.createAdminClient.mockReturnValue({});
    mocks.authenticateDeviceRequest.mockResolvedValue({
      ok: true,
      device: { organization_id: "org-1", status: "active" },
    });
    mocks.readKillSwitches.mockResolvedValue({
      global: true,
      organization: false,
      capability: false,
      provider: false,
      anyActive: true,
      envDisabled: true,
      explicit: false,
      reasons: ["autonomy_disabled"],
    });
    mocks.resolveJobMode.mockResolvedValue("shadow");

    const response = await POST(
      new Request("http://localhost/api/agent/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          agentVersion: "1.0.0",
          catalogVersion: "2026-09-21.3",
          uptimeSec: 1,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      killSwitch: false,
      executionEnabled: false,
    });
  });
});
