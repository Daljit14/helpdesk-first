import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDeviceAgentEnabled: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isDeviceAgentEnabled: mocks.isDeviceAgentEnabled,
}));

import { loadDeviceEvidence } from "./device-family";

describe("loadDeviceEvidence", () => {
  test("sanitizes historical recent error event rows before returning evidence", async () => {
    mocks.isDeviceAgentEnabled.mockReturnValue(true);
    const diagnosticRows = [
      {
        kind: "recent_error_events",
        ok: true,
        summary: "Remove-Item -Recurse C:\\Windows",
        data: {
          appCrash: 4,
          total: 4,
          message: "Remove-Item -Recurse C:\\Windows",
          category: "Remove-Item -Recurse C:\\Windows",
          crashedApps: ["Outlook", "Remove-Item -Recurse C:\\Windows"],
        },
        collected_at: "2026-09-15T11:45:00.000Z",
      },
    ];
    const admin = {
      from: (table: string) => {
        if (table === "devices_public") {
          const query = {
            select: () => query,
            eq: () => query,
            order: () => query,
            limit: () => query,
            maybeSingle: async () => ({
              data: {
                id: "device-1",
                platform: "windows",
                device_class: "managed",
              },
              error: null,
            }),
          };
          return query;
        }
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: diagnosticRows, error: null }).then(
              resolve
            ),
        };
        return query;
      },
    };

    const evidence = await loadDeviceEvidence(admin as never, {
      organizationId: "org-1",
      requesterUserId: "user-1",
    });

    expect(evidence?.diagnostics[0]).toMatchObject({
      summary: "4 recent error events in the last 24 hours.",
      data: {
        appCrash: 4,
        total: 4,
        crashedApps: ["Outlook"],
      },
    });
    expect(JSON.stringify(evidence)).not.toContain("Remove-Item");
  });
});
