import type { DiagnosticKind } from "../../../lib/device-agent/protocol";
import { boundedError, record, type Collector } from "./index";
import { SERVICE_NAMES, WINDOWS_SERVICE_COMMANDS } from "../service-maps";
import { parseJsonRows } from "./shared";

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

function parsePrinters(output: string, spoolerOutput: string) {
  const rows = parseJsonRows(output);
  const names: string[] = [];
  const jobCounts: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const name =
      typeof value.Name === "string" ? value.Name.trim().slice(0, 80) : "";
    if (!name) continue;
    names.push(name);
    const count =
      typeof value.Jobs === "number" && Number.isFinite(value.Jobs)
        ? Math.max(0, Math.trunc(value.Jobs))
        : 0;
    jobCounts.push(`${name}:${count}`);
  }
  return record("printers", {
    names: names.slice(0, 40),
    jobCounts: jobCounts.slice(0, 40),
    jobCount: jobCounts.reduce((total, value) => {
      const count = Number(value.split(":").at(-1));
      return total + (Number.isFinite(count) ? count : 0);
    }, 0),
    spooler: /running/i.test(spoolerOutput) ? "running" : "stopped",
  });
}

function parseAudio(output: string) {
  const services = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /running|stopped/i.test(line));
  return record("audio", {
    services: services.slice(0, 4).map((line) => line.slice(0, 80)),
    running:
      services.length > 0 && services.every((line) => /running/i.test(line)),
  });
}

function privacyAccess(value: unknown): "allow" | "deny" | "unknown" {
  if (typeof value !== "string") return "unknown";
  if (/^allow$/i.test(value)) return "allow";
  if (/^deny$/i.test(value)) return "deny";
  return "unknown";
}

function windowsPrivacyCollector(
  kind: "camera_privacy" | "mic_privacy",
  store: "webcam" | "microphone",
  devices: string
): Collector {
  const base =
    "Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\";
  const command =
    `$user=(Get-ItemProperty 'HKCU:\\Software\\${base}${store}' -ErrorAction SilentlyContinue).Value; ` +
    `$system=(Get-ItemProperty 'HKLM:\\SOFTWARE\\${base}${store}' -ErrorAction SilentlyContinue).Value; ` +
    `$devices=@(${devices}).Count; ` +
    "[pscustomobject]@{UserAccess=$user;SystemAccess=$system;DevicesPresent=$devices} | ConvertTo-Json -Compress";
  return powershell(kind, command, (output) => {
    const value = JSON.parse(output) as Record<string, unknown>;
    const userAccess = privacyAccess(value.UserAccess);
    const systemAccess = privacyAccess(value.SystemAccess);
    const rawDevices = value.DevicesPresent;
    const devicesPresent =
      typeof rawDevices === "number" &&
      Number.isFinite(rawDevices) &&
      rawDevices >= 0
        ? Math.trunc(rawDevices)
        : null;
    const blocked = userAccess === "deny" || systemAccess === "deny";
    if (kind === "mic_privacy") {
      return record(kind, {
        userAccess,
        systemAccess,
        devicesPresent,
        muted: null,
        blocked,
      });
    }
    return record(kind, {
      userAccess,
      systemAccess,
      devicesPresent,
      blocked,
    });
  });
}

function parseWindowsExpiredTickets(output: string): number {
  let expired = 0;
  for (const match of output.matchAll(/^\s*End Time:\s*(.+?)\s*$/gim)) {
    const value = match[1]?.replace(/\s+\(local\)\s*$/i, "") ?? "";
    const time = Date.parse(value);
    if (Number.isFinite(time) && time < Date.now()) expired += 1;
  }
  return expired;
}

function windowsCredentialHealthCollector(): Collector {
  return {
    kind: "credential_health",
    run: async (exec) => {
      let storedCredentials: number | null = null;
      let kerberosTickets: number | null = null;
      let kerberosExpired: number | null = null;
      try {
        const output = await exec("cmdkey", ["/list"]);
        storedCredentials = (output.match(/^\s*Target:/gim) ?? []).length;
      } catch {
        storedCredentials = null;
      }
      try {
        const output = await exec("klist", []);
        kerberosTickets = (output.match(/^\s*#\d+>/gm) ?? []).length;
        kerberosExpired = parseWindowsExpiredTickets(output);
      } catch {
        kerberosTickets = null;
        kerberosExpired = null;
      }
      return record("credential_health", {
        storedCredentials,
        kerberosTickets,
        kerberosExpired,
        stale: (kerberosExpired ?? 0) > 0,
      });
    },
  };
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
      for (const service of SERVICE_NAMES) {
        try {
          const output = await exec("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `(Get-Service ${WINDOWS_SERVICE_COMMANDS[service]}).Status`,
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
    "[pscustomobject]@{ RealTimeProtectionEnabled=(Get-MpComputerStatus).RealTimeProtectionEnabled; ThreatCount=@(Get-MpThreatDetection).Count } | ConvertTo-Json -Compress",
    (output) => {
      const row = parseJsonRows(output)[0] ?? {};
      return record("security_tool_status", {
        realTimeProtection:
          typeof row.RealTimeProtectionEnabled === "boolean"
            ? row.RealTimeProtectionEnabled
            : null,
        threatCount:
          typeof row.ThreatCount === "number" &&
          Number.isFinite(row.ThreatCount)
            ? Math.max(0, Math.trunc(row.ThreatCount))
            : 0,
      });
    }
  ),
  {
    kind: "printers",
    run: async (exec) => {
      try {
        const printers = await exec("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-Printer | ForEach-Object { [pscustomobject]@{ Name=$_.Name; Jobs=@(Get-PrintJob -PrinterName $_.Name).Count } } | ConvertTo-Json -Compress",
        ]);
        const spooler = await exec("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "(Get-Service Spooler).Status",
        ]);
        return parsePrinters(printers, spooler);
      } catch (error) {
        return boundedError("printers", error);
      }
    },
  },
  {
    kind: "audio",
    run: async (exec) => {
      try {
        const output = await exec("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-Service Audiosrv,AudioEndpointBuilder | Select-Object Name,Status | ConvertTo-Csv -NoTypeInformation",
        ]);
        return parseAudio(output);
      } catch (error) {
        return boundedError("audio", error);
      }
    },
  },
  windowsPrivacyCollector(
    "camera_privacy",
    "webcam",
    "Get-PnpDevice -Class Camera,Image -PresentOnly -ErrorAction SilentlyContinue"
  ),
  windowsPrivacyCollector(
    "mic_privacy",
    "microphone",
    "Get-PnpDevice -Class AudioEndpoint -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Microphone|Mic|Input' }"
  ),
  windowsCredentialHealthCollector(),
];
