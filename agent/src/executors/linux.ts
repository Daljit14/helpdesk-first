import {
  LINUX_SERVICE_COMMANDS as serviceCommands,
  type ServiceName,
} from "../service-maps";
import type { Executor, SnapshotData } from ".";
import { cleanupExecutor } from "./cleanup";
import {
  requiredString,
  runDiagnostic,
  serviceStatus,
  snapshotString,
  truncate,
} from "./shared";

function activeDevice(output: string): string {
  for (const line of output.split(/\r?\n/)) {
    const [device, state] = line.split(":");
    if (
      device &&
      state &&
      ["connected", "activated", "up"].includes(state.toLowerCase())
    )
      return device;
  }
  throw new Error("adapter_not_found");
}

function service(params: Record<string, unknown>): {
  name: ServiceName;
  unit: string;
} {
  const name = requiredString(params.serviceName) as ServiceName;
  const unit = serviceCommands[name];
  if (!unit) throw new Error("unsupported_on_platform");
  return { name, unit };
}

const flushDns: Executor = {
  actionId: "device_flush_dns",
  platform: "linux",
  snapshot: async () => ({ entries: null }),
  apply: async (exec) => {
    await exec("resolvectl", ["flush-caches"], { timeoutMs: 30_000 });
  },
  verify: async (exec) => {
    const result = await runDiagnostic("linux", "dns_resolution", exec);
    return { ok: result.ok, summary: result.summary };
  },
  rollback: async () => {},
};

const resetNetworkAdapter: Executor = {
  actionId: "device_reset_network_adapter",
  platform: "linux",
  snapshot: async (exec) => {
    const adapters = await exec(
      "nmcli",
      ["-t", "-f", "DEVICE,STATE", "device"],
      { timeoutMs: 30_000 }
    );
    return {
      device: truncate(activeDevice(adapters)),
      adapterConfig: truncate(adapters),
      ipConfig: truncate(
        await exec("nmcli", ["-t", "device", "show"], {
          timeoutMs: 30_000,
        })
      ),
    };
  },
  apply: async (exec, params) => {
    const snapshot = params.__snapshot;
    if (!snapshot || typeof snapshot !== "object")
      throw new Error("snapshot_invalid");
    const device = snapshotString(snapshot as SnapshotData, "device");
    await exec("nmcli", ["device", "disconnect", device], {
      timeoutMs: 30_000,
    });
    await exec("nmcli", ["device", "connect", device], {
      timeoutMs: 30_000,
    });
  },
  verify: async (exec) => {
    const result = await runDiagnostic("linux", "network_status", exec);
    return {
      ok: result.ok && result.data.connected === true,
      summary: result.summary,
    };
  },
  rollback: async (exec, _params, snapshot) => {
    await exec(
      "nmcli",
      ["device", "connect", snapshotString(snapshot, "device")],
      {
        timeoutMs: 30_000,
      }
    );
  },
};

const resetWifi: Executor = {
  actionId: "device_reset_wifi_profile",
  platform: "linux",
  snapshot: async (exec) => {
    const result = await runDiagnostic("linux", "wifi_status", exec);
    return {
      previousSsid:
        typeof result.data.ssid === "string" ? result.data.ssid : null,
      connected: result.data.connected === true,
    };
  },
  apply: async (exec, params) => {
    const ssid = requiredString(params.ssid);
    await exec("nmcli", ["connection", "down", ssid], {
      timeoutMs: 30_000,
    });
    await exec("nmcli", ["connection", "up", ssid], {
      timeoutMs: 30_000,
    });
  },
  verify: async (exec, params) => {
    const result = await runDiagnostic("linux", "wifi_status", exec);
    const ok =
      result.ok &&
      result.data.connected === true &&
      result.data.ssid === params.ssid;
    return { ok, summary: result.summary };
  },
  rollback: async (exec, params, snapshot) => {
    const previousSsid = snapshot.previousSsid;
    if (
      typeof previousSsid === "string" &&
      previousSsid.length > 0 &&
      previousSsid !== params.ssid
    )
      await exec("nmcli", ["connection", "up", previousSsid], {
        timeoutMs: 30_000,
      });
  },
};

const restartService: Executor = {
  actionId: "device_restart_service",
  platform: "linux",
  snapshot: async (exec, params) => {
    const { name, unit } = service(params);
    const status = await exec("systemctl", ["is-active", unit], {
      timeoutMs: 30_000,
    });
    return {
      serviceName: truncate(name),
      serviceUnit: truncate(unit),
      status: /active|running/i.test(status) ? "running" : "stopped",
    };
  },
  apply: async (exec, params) => {
    const { unit } = service(params);
    await exec("systemctl", ["restart", unit], { timeoutMs: 30_000 });
  },
  verify: async (exec, params) => {
    const { name } = service(params);
    const result = await runDiagnostic("linux", "service_status", exec);
    const status = serviceStatus(result, name);
    return { ok: status === "running", summary: `${name}=${status}` };
  },
  rollback: async (exec, _params, snapshot) => {
    const unit = snapshotString(snapshot, "serviceUnit");
    const operation = snapshot.status === "stopped" ? "stop" : "start";
    await exec("systemctl", [operation, unit], { timeoutMs: 30_000 });
  },
};

const cleanup = cleanupExecutor("linux", () => ["/tmp", "/var/tmp"]);

export const linuxExecutors: readonly Executor[] = [
  flushDns,
  resetNetworkAdapter,
  resetWifi,
  restartService,
  cleanup,
];
