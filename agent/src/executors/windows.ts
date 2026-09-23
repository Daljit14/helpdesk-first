import { tmpdir } from "node:os";
import { WINDOWS_SERVICE_COMMANDS, type ServiceName } from "../service-maps";
import type { Executor, SnapshotData } from ".";
import { cleanupExecutor } from "./cleanup";
import {
  requiredString,
  runDiagnostic,
  serviceStatus,
  snapshotString,
  truncate,
} from "./shared";

const powershell = ["-NoProfile", "-NonInteractive", "-Command"] as const;

function service(params: Record<string, unknown>): {
  name: ServiceName;
  command: string;
} {
  const name = requiredString(params.serviceName) as ServiceName;
  const command = WINDOWS_SERVICE_COMMANDS[name];
  if (!command) throw new Error("unsupported_on_platform");
  return { name, command };
}

function parseAdapterName(output: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("adapter_not_found");
  }
  const values = Array.isArray(parsed) ? parsed : [parsed];
  for (const value of values) {
    if (
      value &&
      typeof value === "object" &&
      "Name" in value &&
      "Status" in value &&
      typeof value.Name === "string" &&
      typeof value.Status === "string" &&
      value.Status.toLowerCase() === "up"
    )
      return value.Name;
  }
  throw new Error("adapter_not_found");
}

const flushDns: Executor = {
  actionId: "device_flush_dns",
  platform: "windows",
  snapshot: async (exec) => {
    const output = await exec("ipconfig", ["/displaydns"], {
      timeoutMs: 30_000,
    });
    return {
      entries: output.split(/\r?\n/).filter((line) => line.trim()).length,
    };
  },
  apply: async (exec) => {
    await exec("ipconfig", ["/flushdns"], { timeoutMs: 30_000 });
  },
  verify: async (exec) => {
    const result = await runDiagnostic("windows", "dns_resolution", exec);
    return { ok: result.ok, summary: result.summary };
  },
  rollback: async () => {},
};

const resetNetworkAdapter: Executor = {
  actionId: "device_reset_network_adapter",
  platform: "windows",
  snapshot: async (exec) => {
    const adapterConfig = await exec(
      "powershell.exe",
      [
        ...powershell,
        "Get-NetAdapter | Select Name,Status,MacAddress | ConvertTo-Json",
      ],
      { timeoutMs: 30_000 }
    );
    const ipConfig = await exec(
      "powershell.exe",
      [...powershell, "Get-NetIPConfiguration | ConvertTo-Json"],
      { timeoutMs: 30_000 }
    );
    return {
      adapterName: truncate(parseAdapterName(adapterConfig)),
      adapterConfig: truncate(adapterConfig),
      ipConfig: truncate(ipConfig),
    };
  },
  apply: async (exec, _params) => {
    const snapshot = _params.__snapshot;
    if (!snapshot || typeof snapshot !== "object")
      throw new Error("snapshot_invalid");
    const adapterName = snapshotString(snapshot as SnapshotData, "adapterName");
    await exec(
      "powershell.exe",
      [
        ...powershell,
        "Restart-NetAdapter -Name $args[0] -Confirm:$false",
        adapterName,
      ],
      { timeoutMs: 30_000 }
    );
  },
  verify: async (exec) => {
    const result = await runDiagnostic("windows", "network_status", exec);
    return {
      ok: result.ok && result.data.connected === true,
      summary: result.summary,
    };
  },
  rollback: async (exec, _params, snapshot) => {
    await exec(
      "powershell.exe",
      [
        ...powershell,
        "Restart-NetAdapter -Name $args[0] -Confirm:$false",
        snapshotString(snapshot, "adapterName"),
      ],
      { timeoutMs: 30_000 }
    );
  },
};

const resetWifi: Executor = {
  actionId: "device_reset_wifi_profile",
  platform: "windows",
  snapshot: async (exec) => {
    const result = await runDiagnostic("windows", "wifi_status", exec);
    return {
      previousSsid:
        typeof result.data.ssid === "string" ? result.data.ssid : null,
      connected: result.data.connected === true,
    };
  },
  apply: async (exec, params) => {
    const ssid = requiredString(params.ssid);
    await exec("netsh", ["wlan", "disconnect"], { timeoutMs: 30_000 });
    await exec("netsh", ["wlan", "connect", `name=${ssid}`], {
      timeoutMs: 30_000,
    });
  },
  verify: async (exec, params) => {
    const result = await runDiagnostic("windows", "wifi_status", exec);
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
      await exec("netsh", ["wlan", "connect", `name=${previousSsid}`], {
        timeoutMs: 30_000,
      });
  },
};

const restartService: Executor = {
  actionId: "device_restart_service",
  platform: "windows",
  snapshot: async (exec, params) => {
    const { name, command } = service(params);
    const status = await exec(
      "powershell.exe",
      [...powershell, "(Get-Service -Name $args[0]).Status", command],
      { timeoutMs: 30_000 }
    );
    return {
      serviceName: truncate(name),
      serviceCommand: truncate(command),
      status: /running/i.test(status) ? "running" : "stopped",
    };
  },
  apply: async (exec, params) => {
    const { command } = service(params);
    await exec(
      "powershell.exe",
      [...powershell, "Restart-Service -Name $args[0] -Force", command],
      { timeoutMs: 30_000 }
    );
  },
  verify: async (exec, params) => {
    const { name } = service(params);
    const result = await runDiagnostic("windows", "service_status", exec);
    const status = serviceStatus(result, name);
    return {
      ok: status === "running",
      summary: `${name}=${status}`,
    };
  },
  rollback: async (exec, _params, snapshot) => {
    const command = snapshotString(snapshot, "serviceCommand");
    const operation =
      snapshot.status === "stopped" ? "Stop-Service" : "Start-Service";
    await exec(
      "powershell.exe",
      [...powershell, `${operation} -Name $args[0]`, command],
      { timeoutMs: 30_000 }
    );
  },
};

const cleanup = cleanupExecutor("windows", () => [
  process.env.TEMP ?? tmpdir(),
  "C:\\Windows\\Temp",
]);

export const windowsExecutors: readonly Executor[] = [
  flushDns,
  resetNetworkAdapter,
  resetWifi,
  restartService,
  cleanup,
];
