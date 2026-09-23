import { describe, expect, it } from "vitest";
import type { AgentExec } from "./collectors/index";
import { createJobRunner, type AgentJob } from "./jobs";
import type { SnapshotData } from "./executors";

const now = new Date("2026-09-23T00:00:00.000Z");

function fakeRuntime(options: {
  executionEnabled?: boolean;
  executionOptIn?: boolean;
  failApply?: boolean;
  snapshot?: SnapshotData | null;
}) {
  const calls: Array<{ file: string; args: string[] }> = [];
  const events: string[] = [];
  const exec: AgentExec = async (file, args) => {
    calls.push({ file, args });
    if (options.failApply && file === "nmcli" && args[1] === "disconnect")
      throw new Error("apply failed");
    if (file === "nmcli" && args[0] === "-t" && args[1] === "-f")
      return "eth0:connected";
    if (file === "nmcli" && args[0] === "-t") return "eth0:connected";
    if (file === "nmcli" && args[1] === "device") return "ip=ok";
    return "";
  };
  const runner = createJobRunner({
    exec,
    platform: () => "linux",
    executionOptIn: async () => options.executionOptIn === true,
    loadSnapshot: async () => options.snapshot ?? null,
    saveSnapshot: async () => {
      events.push("snapshot");
    },
    snapshotHash: () => "snapshot-hash",
  });
  return { runner, calls, events };
}

function job(overrides: Partial<AgentJob> = {}): AgentJob {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    actionId: "device_reset_network_adapter",
    actionVersion: 1,
    parameters: {},
    mode: "execute",
    kind: "action",
    rollbackOf: null,
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    snapshotSpec: ["adapter_config", "ip_config"],
    ...overrides,
  };
}

describe("agent job execution gates", () => {
  it.each([
    ["shadow", false, false, "shadowed"],
    ["shadow", true, true, "shadowed"],
    ["execute", false, false, "unsupported"],
    ["execute", false, true, "unsupported"],
    ["execute", true, false, "unsupported"],
    ["execute", true, true, "succeeded"],
  ] as const)(
    "mode=%s server=%s optIn=%s",
    async (mode, executionEnabled, executionOptIn, status) => {
      const fake = fakeRuntime({ executionEnabled, executionOptIn });
      const report = await fake.runner(job({ mode }), {
        executionEnabled,
        now,
      });
      expect(report.status).toBe(status);
      const applied = fake.calls.some(
        (call) =>
          call.file === "nmcli" &&
          call.args[0] === "device" &&
          call.args[1] === "disconnect"
      );
      expect(applied).toBe(status === "succeeded");
    }
  );

  it("expires jobs before invoking any command", async () => {
    const fake = fakeRuntime({ executionEnabled: true, executionOptIn: true });
    const report = await fake.runner(
      job({ expiresAt: new Date(now.getTime() - 1).toISOString() }),
      { executionEnabled: true, now }
    );
    expect(report).toEqual({
      status: "failed",
      output: {},
      error: "expired",
    });
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects invalid SSIDs before invoking any command", async () => {
    const fake = fakeRuntime({ executionEnabled: true, executionOptIn: true });
    const report = await fake.runner(
      job({
        actionId: "device_reset_wifi_profile",
        parameters: { ssid: "bad\nssid" },
        snapshotSpec: ["wifi_profile"],
      }),
      { executionEnabled: true, now }
    );
    expect(report).toEqual({
      status: "failed",
      output: {},
      error: "invalid_parameters",
    });
    expect(fake.calls).toHaveLength(0);
  });

  it("saves the snapshot before apply and rolls back apply failures", async () => {
    const fake = fakeRuntime({
      executionEnabled: true,
      executionOptIn: true,
      failApply: true,
    });
    const report = await fake.runner(job(), {
      executionEnabled: true,
      now,
    });
    expect(fake.events).toEqual(["snapshot"]);
    expect(fake.calls.slice(-1)).toEqual([
      { file: "nmcli", args: ["device", "connect", "eth0"] },
    ]);
    expect(report).toMatchObject({
      status: "failed",
      error: "apply_failed_rolled_back",
      snapshot: { hash: "snapshot-hash" },
      output: { rolledBack: true },
    });
  });

  it("restores rollback jobs from a local snapshot", async () => {
    const fake = fakeRuntime({
      executionEnabled: true,
      executionOptIn: true,
      snapshot: { device: "eth0" },
    });
    const report = await fake.runner(
      job({
        kind: "rollback",
        rollbackOf: "00000000-0000-0000-0000-000000000002",
      }),
      { executionEnabled: true, now }
    );
    expect(report).toMatchObject({
      status: "succeeded",
      snapshot: { hash: "snapshot-hash" },
    });
    expect(fake.calls).toContainEqual({
      file: "nmcli",
      args: ["device", "connect", "eth0"],
    });
  });

  it("rejects missing snapshots and irreversible rollbacks", async () => {
    const missing = fakeRuntime({
      executionEnabled: true,
      executionOptIn: true,
    });
    expect(
      (
        await missing.runner(
          job({
            kind: "rollback",
            rollbackOf: "00000000-0000-0000-0000-000000000002",
          }),
          { executionEnabled: true, now }
        )
      ).error
    ).toBe("snapshot_missing");
    const cleanup = fakeRuntime({
      executionEnabled: true,
      executionOptIn: true,
    });
    expect(
      (
        await cleanup.runner(
          job({
            actionId: "device_cleanup_temp_files",
            kind: "rollback",
            rollbackOf: "00000000-0000-0000-0000-000000000002",
            snapshotSpec: ["temp_inventory"],
          }),
          { executionEnabled: true, now }
        )
      ).error
    ).toBe("irreversible");
  });
});
