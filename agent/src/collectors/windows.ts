import type { DiagnosticKind } from "../../../lib/device-agent/protocol";
import { boundedError, record, type Collector } from "./index";

const SERVICES = [
  "vpn",
  "sso_helper",
  "print_spooler",
  "windows_update",
  "defender",
] as const;
const SERVICE_COMMANDS: Record<(typeof SERVICES)[number], string> = {
  vpn: "RasMan",
  sso_helper: "sso_helper",
  print_spooler: "Spooler",
  windows_update: "wuauserv",
  defender: "WinDefend",
};

function powershell(
  kind: DiagnosticKind,
  command: string,
  parse: (output: string) => ReturnType<typeof record>
): Collector {
  return {
    kind,
    run: async (exec) => {
      try {
        return parse(
          await exec("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            command,
          ])
        );
      } catch (error) {
        return boundedError(kind, error);
      }
    },
  };
}

function parseNetwork(output: string) {
  const adaptersUp = (output.match(/\bUp\b/gi) ?? []).length;
  return record("network_status", { adaptersUp, connected: adaptersUp > 0 });
}

function parseWifi(output: string) {
  const state = output.match(/^\s*State\s*:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const ssid = output.match(/^\s*SSID\s*:\s*(.+)$/im)?.[1]?.trim() ?? null;
  return record("wifi_status", {
    connected: state.toLowerCase() === "connected",
    ssid: state.toLowerCase() === "connected" ? ssid : null,
  });
}

function parseDisk(output: string) {
  const values = output.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const [freeBytes, totalBytes] = values;
  if (!freeBytes || !totalBytes) {
    return record("disk_space", { freePercent: 0, freeGb: 0 }, false);
  }
  return record("disk_space", {
    freePercent: Math.max(0, Math.min(100, (freeBytes / totalBytes) * 100)),
    freeGb: freeBytes / 1024 / 1024 / 1024,
  });
}

export const windowsCollectors: Collector[] = [
  powershell(
    "network_status",
    "Get-NetAdapter | Select-Object Status",
    parseNetwork
  ),
  {
    kind: "wifi_status",
    run: async (exec) => {
      try {
        return parseWifi(await exec("netsh", ["wlan", "show", "interfaces"]));
      } catch (error) {
        return boundedError("wifi_status", error);
      }
    },
  },
  powershell("vpn_status", "(Get-Service RasMan).Status", (output) =>
    record("vpn_status", {
      connected: /running/i.test(output),
      required: false,
    })
  ),
  powershell(
    "disk_space",
    "Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\" | Select-Object FreeSpace,Size",
    parseDisk
  ),
  powershell("pending_updates", "Write-Output 'not available'", () =>
    record("pending_updates", { available: null, stuck: false })
  ),
  {
    kind: "service_status",
    run: async (exec) => {
      const data: Record<string, string> = {};
      let failed = false;
      for (const service of SERVICES) {
        try {
          const output = await exec("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `(Get-Service ${SERVICE_COMMANDS[service]}).Status`,
          ]);
          data[service] = /running/i.test(output) ? "running" : "stopped";
        } catch {
          data[service] = "unknown";
          failed = true;
        }
      }
      return record("service_status", data, !failed);
    },
  },
  powershell(
    "security_tool_status",
    "Get-MpComputerStatus | Select-Object RealTimeProtectionEnabled",
    (output) =>
      record("security_tool_status", {
        realTimeProtection: /true/i.test(output)
          ? true
          : /false/i.test(output)
            ? false
            : null,
      })
  ),
];
