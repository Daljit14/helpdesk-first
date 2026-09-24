import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  authenticateDeviceRequest: vi.fn(),
  isDeviceAgentEnabled: vi.fn(),
  leaseJobsForDevice: vi.fn(),
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
vi.mock("@/lib/device-agent/server/jobs", () => ({
  leaseJobsForDevice: mocks.leaseJobsForDevice,
}));

import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("device job poll route", () => {
  test("normalizes offset job expiry timestamps for the agent", async () => {
    mocks.isDeviceAgentEnabled.mockReturnValue(true);
    mocks.createAdminClient.mockReturnValue({});
    mocks.authenticateDeviceRequest.mockResolvedValue({
      ok: true,
      device: { id: "device-1", organization_id: "org-1", status: "active" },
    });
    mocks.leaseJobsForDevice.mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000001",
        action_id: "device_flush_dns",
        action_version: 1,
        parameters: {},
        mode: "shadow",
        kind: "action",
        rollback_of: null,
        expires_at: "2026-09-23T14:39:39.000+00:00",
        snapshot_spec: [],
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/agent/jobs/poll", {
        method: "POST",
        body: "",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      jobs: [
        expect.objectContaining({
          expiresAt: "2026-09-23T14:39:39.000Z",
        }),
      ],
    });
  });
});
