import { describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import {
  killSwitchBlocksDeviceJob,
  leaseJobsForDevice,
  recordJobResult,
} from "./jobs";

vi.mock("@/lib/autonomy/kill-switches", () => ({
  readKillSwitches: vi.fn(),
}));

function fakeAdmin(
  job: Record<string, unknown>,
  original: Record<string, unknown>
) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    updates,
    from(table: string) {
      if (table === "device_jobs")
        return {
          select(columns: string) {
            const row = columns === "*" ? job : original;
            return {
              eq() {
                return this;
              },
              maybeSingle: async () => ({ data: row, error: null }),
            };
          },
          update(value: Record<string, unknown>) {
            updates.push(value);
            return {
              eq() {
                return this;
              },
              then(
                resolve: (value: { error: null }) => unknown
              ): Promise<unknown> {
                return Promise.resolve(resolve({ error: null }));
              },
            };
          },
        };
      return {
        insert: vi.fn(async () => ({ error: null })),
      };
    },
  };
  return admin;
}

describe("recordJobResult", () => {
  it("fails rollback reports whose snapshot hash differs", async () => {
    const admin = fakeAdmin(
      {
        id: "job-rollback",
        device_id: "device-1",
        organization_id: "org-1",
        status: "leased",
        kind: "rollback",
        rollback_of: "job-original",
      },
      { snapshot_hash: "original-hash" }
    );
    const result = await recordJobResult(
      admin as unknown as ReturnType<typeof createAdminClient>,
      {
        id: "device-1",
        organization_id: "org-1",
        user_id: null,
        device_class: "managed",
        platform: "linux",
        hostname: "host",
        agent_version: "1.1.0",
        public_key: "key",
        catalog_version: "2026-09-21.3",
        status: "active",
      },
      "job-rollback",
      {
        status: "succeeded",
        output: {},
        snapshot: { hash: "wrong-hash", kinds: ["adapter_config"] },
      }
    );
    expect(result).toEqual({ ok: true });
    expect(admin.updates[0]).toMatchObject({
      status: "failed",
      error: "snapshot_hash_mismatch",
    });
  });
});

const device = {
  id: "device-1",
  organization_id: "org-1",
  user_id: null,
  device_class: "managed" as const,
  platform: "linux" as const,
  hostname: "host",
  agent_version: "1.1.0",
  public_key: "key",
  catalog_version: "2026-09-21.3",
  status: "active" as const,
};

function leaseAdmin(rows: Array<Record<string, unknown>>) {
  const updates: Array<Record<string, unknown>> = [];
  const rpc = vi.fn(async () => ({ data: rows, error: null }));
  type LeaseQuery = {
    select: (...args: unknown[]) => LeaseQuery;
    eq: (...args: unknown[]) => LeaseQuery;
    gt: (...args: unknown[]) => LeaseQuery;
    in: (...args: unknown[]) => LeaseQuery;
    update: (value: Record<string, unknown>) => LeaseQuery;
    then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
  };
  const admin = {
    updates,
    rpc,
    from(table: string) {
      if (table !== "device_jobs") return {};
      let updateCalled = false;
      const query: LeaseQuery = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        gt: vi.fn(() => query),
        in: vi.fn(() => query),
        update: (value: Record<string, unknown>) => {
          updateCalled = true;
          updates.push(value);
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(
            updateCalled
              ? resolve({ error: null })
              : resolve({ data: rows, error: null })
          );
        },
      };
      return query;
    },
  };
  return admin;
}

const noExplicitSwitches = {
  global: true,
  organization: false,
  capability: false,
  provider: false,
  anyActive: true,
  envDisabled: true,
  explicit: false,
  reasons: ["autonomy_disabled"],
};

describe("device job kill-switch handling", () => {
  it.each([
    ["shadow", false, false, false],
    ["shadow", false, true, true],
    ["execute", false, true, false],
    ["execute", true, true, true],
  ] as const)(
    "blocks %s jobs with anyActive=%s and explicit=%s as expected",
    (mode, anyActive, explicit, expected) => {
      expect(killSwitchBlocksDeviceJob({ anyActive, explicit }, mode)).toBe(
        expected
      );
    }
  );

  it("leases shadow jobs but cancels execute jobs when autonomy is env-disabled", async () => {
    vi.mocked(readKillSwitches).mockResolvedValue(noExplicitSwitches);
    const admin = leaseAdmin([
      { id: "shadow-1", action_id: "device_network_status", mode: "shadow" },
      { id: "execute-1", action_id: "device_dns_flush", mode: "execute" },
    ]);
    await leaseJobsForDevice(
      admin as unknown as ReturnType<typeof createAdminClient>,
      device
    );
    expect(admin.rpc).toHaveBeenCalledWith("lease_device_jobs", {
      device: "device-1",
      n: 3,
    });
    expect(admin.updates).toContainEqual(
      expect.objectContaining({
        status: "cancelled",
        error: "kill_switch_active",
      })
    );
  });

  it("cancels all queued jobs when an explicit database switch is active", async () => {
    vi.mocked(readKillSwitches).mockResolvedValue({
      ...noExplicitSwitches,
      explicit: true,
    });
    const admin = leaseAdmin([]);
    await leaseJobsForDevice(
      admin as unknown as ReturnType<typeof createAdminClient>,
      device
    );
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.updates).toContainEqual(
      expect.objectContaining({
        status: "cancelled",
        error: "kill_switch_active",
      })
    );
  });
});
