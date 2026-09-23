import { MACOS_SERVICE_COMMANDS, type ServiceName } from "../service-maps";
import type { Executor, SnapshotData } from ".";
import { cleanupExecutor } from "./cleanup";
import {
  requiredString,
  runDiagnostic,
  serviceStatus,
  snapshotString,
  truncate,
} from "./shared";

function networkService(output: string): string {
  const service = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !line.startsWith("*") &&
        !line.startsWith("An asterisk")
    );
  if (!service) throw new Error("adapter_not_found");
  return service;
}

function wifiDevice(output: string): string {
  const match = output.match(
    /Hardware Port:\s*(?:Wi-Fi|AirPort)\s*\r?\nDevice:\s*([^\r\n]+)/i
  );
  if (!match?.[1]) throw new Error("adapter_not_found");
  return match[1].trim();
}

function service(params: Record<string, unknown>): {
  name: ServiceName;
  label: string;
} {
  const name = requiredString(params.serviceName) as ServiceName;
  const label = MACOS_SERVICE_COMMANDS[name];
  if (!label) throw new Error("unsupported_on_platform");
  return { name, label };
}

const flushDns: Executor = {
  actionId: "device_flush_dns",
  platform: "macos",
  snapshot: async () => ({ entries: null }),
  apply: async (exec) => {
    await exec("dscacheutil", ["-flushcache"], { timeoutMs: 30_000 });
    await exec("killall", ["-HUP", "mDNSResponder"], {
      timeoutMs: 30_000,
    });
  },
  verify: async (exec) => {
    const result = await runDiagnostic("macos", "dns_resolution", exec);
    return { ok: result.ok, summary: result.summary };
  },
  rollback: async () => {},
};

const resetNetworkAdapter: Executor = {
  actionId: "device_reset_network_adapter",
  platform: "macos",
  snapshot: async (exec) => {
    const services = await exec("networksetup", ["-listallnetworkservices"], {
      timeoutMs: 30_000,
    });
    return {
      serviceName: truncate(networkService(services)),
      adapterConfig: truncate(services),
      ipConfig: truncate(await exec("ifconfig", [], { timeoutMs: 30_000 })),
    };
  },
  apply: async (exec, params) => {
    const snapshot = params.__snapshot;
    if (!snapshot || typeof snapshot !== "object")
      throw new Error("snapshot_invalid");
    const name = snapshotString(snapshot as SnapshotData, "serviceName");
    await exec("networksetup", ["-setnetworkserviceenabled", name, "off"], {
      timeoutMs: 30_000,
    });
    await exec("networksetup", ["-setnetworkserviceenabled", name, "on"], {
      timeoutMs: 30_000,
    });
  },
  verify: async (exec) => {
    const result = await runDiagnostic("macos", "network_status", exec);
    return {
      ok: result.ok && result.data.connected === true,
      summary: result.summary,
    };
  },
  rollback: async (exec, _params, snapshot) => {
    await exec(
      "networksetup",
      [
        "-setnetworkserviceenabled",
        snapshotString(snapshot, "serviceName"),
        "on",
      ],
      { timeoutMs: 30_000 }
    );
  },
};

const resetWifi: Executor = {
  actionId: "device_reset_wifi_profile",
  platform: "macos",
  snapshot: async (exec) => {
    const result = await runDiagnostic("macos", "wifi_status", exec);
    const hardware = await exec("networksetup", ["-listallhardwareports"], {
      timeoutMs: 30_000,
    });
    return {
      previousSsid:
        typeof result.data.ssid === "string" ? result.data.ssid : null,
      connected: result.data.connected === true,
      wifiDevice: truncate(wifiDevice(hardware)),
    };
  },
  apply: async (exec, params) => {
    const ssid = requiredString(params.ssid);
    const snapshot = params.__snapshot;
    if (!snapshot || typeof snapshot !== "object")
      throw new Error("snapshot_invalid");
    const device = snapshotString(snapshot as SnapshotData, "wifiDevice");
    await exec("networksetup", ["-setairportpower", device, "off"], {
      timeoutMs: 30_000,
    });
    await exec("networksetup", ["-setairportpower", device, "on"], {
      timeoutMs: 30_000,
    });
    await exec("networksetup", ["-setairportnetwork", device, ssid], {
      timeoutMs: 30_000,
    });
  },
  verify: async (exec, params) => {
    const result = await runDiagnostic("macos", "wifi_status", exec);
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
      await exec(
        "networksetup",
        [
          "-setairportnetwork",
          snapshotString(snapshot, "wifiDevice"),
          previousSsid,
        ],
        { timeoutMs: 30_000 }
      );
  },
};

const restartService: Executor = {
  actionId: "device_restart_service",
  platform: "macos",
  snapshot: async (exec, params) => {
    const { name, label } = service(params);
    const result = await exec("launchctl", ["print", `system/${label}`], {
      timeoutMs: 30_000,
    });
    return {
      serviceName: truncate(name),
      serviceLabel: truncate(label),
      status: result.trim() ? "running" : "stopped",
    };
  },
  apply: async (exec, params) => {
    const { label } = service(params);
    await exec("launchctl", ["kickstart", "-k", `system/${label}`], {
      timeoutMs: 30_000,
    });
  },
  verify: async (exec, params) => {
    const { name } = service(params);
    const result = await runDiagnostic("macos", "service_status", exec);
    const status = serviceStatus(result, name);
    return { ok: status === "running", summary: `${name}=${status}` };
  },
  rollback: async (exec, _params, snapshot) => {
    const target = `system/${snapshotString(snapshot, "serviceLabel")}`;
    const args =
      snapshot.status === "stopped"
        ? ["bootout", target]
        : ["kickstart", "-k", target];
    await exec("launchctl", args, { timeoutMs: 30_000 });
  },
};

const cleanup = cleanupExecutor("macos", () => ["/private/tmp"]);

export const macosExecutors: readonly Executor[] = [
  flushDns,
  resetNetworkAdapter,
  resetWifi,
  restartService,
  cleanup,
];
