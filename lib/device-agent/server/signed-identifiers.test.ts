import { afterEach, describe, expect, test, vi } from "vitest";
import { loadSignedDeviceIdentifiers } from "./signed-identifiers";

afterEach(() => vi.unstubAllEnvs());

function fakeAdmin(options: {
  device?: Record<string, unknown> | null;
  deviceError?: boolean;
  diagnosticRows?: Array<Record<string, unknown>>;
  diagnosticError?: boolean;
}) {
  const queries: Array<{
    table: string;
    calls: Array<[string, ...unknown[]]>;
  }> = [];
  const admin = {
    from(table: string) {
      const query = { table, calls: [] as Array<[string, ...unknown[]]> };
      queries.push(query);
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["select", "eq", "in", "gte", "order", "limit"]) {
        chain[method] = (...args: unknown[]) => {
          query.calls.push([method, ...args]);
          return chain;
        };
      }
      chain.maybeSingle = async () => ({
        data: options.device ?? null,
        error: options.deviceError ? new Error("device query failed") : null,
      });
      chain.then = ((resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: options.diagnosticRows ?? [],
          error: options.diagnosticError ? new Error("query failed") : null,
        }).then(resolve)) as (...args: unknown[]) => unknown;
      return chain;
    },
    queries,
  };
  return admin;
}

const device = { id: "device-1" };

describe("loadSignedDeviceIdentifiers", () => {
  test("does not query when the flag is off", async () => {
    vi.stubEnv("HELP_DESK_DEVICE_SIGNED_TRUST_ENABLED", "false");
    const admin = fakeAdmin({ device });

    await expect(
      loadSignedDeviceIdentifiers(admin as never, {
        organizationId: "org-1",
        requesterId: "user-1",
        platform: "Windows",
      })
    ).resolves.toBeNull();
    expect(admin.queries).toEqual([]);
  });

  test("fails closed when no active device is found", async () => {
    vi.stubEnv("HELP_DESK_DEVICE_SIGNED_TRUST_ENABLED", "true");
    const admin = fakeAdmin({});

    await expect(
      loadSignedDeviceIdentifiers(admin as never, {
        organizationId: "org-1",
        requesterId: "user-1",
        platform: "Windows",
      })
    ).resolves.toBeNull();
    expect(admin.queries.map(({ table }) => table)).toEqual(["devices_public"]);
  });

  test("fails closed when the active device query errors", async () => {
    vi.stubEnv("HELP_DESK_DEVICE_SIGNED_TRUST_ENABLED", "true");
    const admin = fakeAdmin({ deviceError: true });

    await expect(
      loadSignedDeviceIdentifiers(admin as never, {
        organizationId: "org-1",
        requesterId: "user-1",
        platform: "Windows",
      })
    ).resolves.toBeNull();
    expect(admin.queries.map(({ table }) => table)).toEqual(["devices_public"]);
  });

  test("fails closed on diagnostic query errors", async () => {
    vi.stubEnv("HELP_DESK_DEVICE_SIGNED_TRUST_ENABLED", "true");
    const admin = fakeAdmin({ device, diagnosticError: true });

    await expect(
      loadSignedDeviceIdentifiers(admin as never, {
        organizationId: "org-1",
        requesterId: "user-1",
        platform: "Windows",
      })
    ).resolves.toBeNull();
  });

  test("uses recent latest rows for the selected tenant device only", async () => {
    vi.stubEnv("HELP_DESK_DEVICE_SIGNED_TRUST_ENABLED", "true");
    const admin = fakeAdmin({
      device,
      diagnosticRows: [
        {
          kind: "wifi_status",
          data: { ssid: "Contoso-Corp" },
          collected_at: "2026-10-07T12:00:00.000Z",
        },
        {
          kind: "wifi_status",
          data: { ssid: "Old-Wifi" },
          collected_at: "2026-10-07T11:00:00.000Z",
        },
        {
          kind: "printers",
          data: { names: ["Office Printer"] },
          collected_at: "2026-10-07T10:00:00.000Z",
        },
      ],
    });

    await expect(
      loadSignedDeviceIdentifiers(admin as never, {
        organizationId: "org-1",
        requesterId: "user-1",
        platform: "Windows",
        now: Date.parse("2026-10-07T12:30:00.000Z"),
      })
    ).resolves.toEqual({
      deviceId: "device-1",
      identifiers: ["Contoso-Corp", "Office Printer"],
    });
    expect(admin.queries[0]).toMatchObject({
      table: "devices_public",
      calls: expect.arrayContaining([
        ["eq", "organization_id", "org-1"],
        ["eq", "user_id", "user-1"],
        ["eq", "platform", "windows"],
        ["eq", "status", "active"],
      ]),
    });
    expect(admin.queries[1]).toMatchObject({
      table: "device_diagnostics",
      calls: expect.arrayContaining([
        ["eq", "organization_id", "org-1"],
        ["eq", "device_id", "device-1"],
        ["in", "kind", ["wifi_status", "printers"]],
        ["gte", "collected_at", "2026-10-06T12:30:00.000Z"],
        ["order", "collected_at", { ascending: false }],
        ["limit", 20],
      ]),
    });
  });
});
