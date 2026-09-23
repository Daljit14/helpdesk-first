import type { DiagnosticKind } from "../../../lib/device-agent/protocol";
import { boundedError, record, type Collector } from "./index";
import { MACOS_SERVICE_COMMANDS, SERVICE_NAMES } from "../service-maps";

function commandCollector(
  kind: DiagnosticKind,
  file: string,
  args: string[],
  parse: (output: string) => ReturnType<typeof record>
): Collector {
  return {
    kind,
    run: async (exec) => {
      try {
        return parse(await exec(file, args));
      } catch (error) {
        return boundedError(kind, error);
      }
    },
  };
}

function parseNetwork(output: string) {
  const adaptersUp = [...output.matchAll(/<[^>]*\bUP\b[^>]*>/gi)].length;
  return record("network_status", { adaptersUp, connected: adaptersUp > 0 });
}

function parseWifi(output: string) {
  const ssid =
    output.match(/Current Wi-Fi Network:\s*(.+)/i)?.[1]?.trim() || null;
  return record("wifi_status", { connected: Boolean(ssid), ssid });
}

function parseDisk(output: string) {
  const fields = (output.split(/\r?\n/).filter(Boolean).at(-1) ?? "")
    .trim()
    .split(/\s+/);
  const blocks = Number(fields[1]);
  const available = Number(fields[3]);
  if (!Number.isFinite(blocks) || !Number.isFinite(available) || blocks <= 0) {
    return record("disk_space", { freePercent: 0, freeGb: 0 }, false);
  }
  return record("disk_space", {
    freePercent: Math.max(0, Math.min(100, (available / blocks) * 100)),
    freeGb: available / 1024 / 1024,
  });
}

function serviceCollector(): Collector {
  return {
    kind: "service_status",
    run: async (exec) => {
      const data: Record<string, string> = {};
      let failed = false;
      for (const service of SERVICE_NAMES) {
        const label = MACOS_SERVICE_COMMANDS[service];
        if (!label) {
          data[service] = "unknown";
          continue;
        }
        try {
          const output = await exec("launchctl", ["print", `system/${label}`]);
          data[service] = output.trim() ? "running" : "stopped";
        } catch {
          data[service] = "unknown";
          failed = true;
        }
      }
      return record("service_status", data, !failed);
    },
  };
}

export const macosCollectors: Collector[] = [
  commandCollector("network_status", "ifconfig", [], parseNetwork),
  commandCollector(
    "wifi_status",
    "networksetup",
    ["-getairportnetwork", "en0"],
    parseWifi
  ),
  commandCollector("vpn_status", "scutil", ["--nc", "list"], (output) =>
    record("vpn_status", {
      connected: /Connected/i.test(output),
      required: false,
    })
  ),
  commandCollector("disk_space", "df", ["-k", "/"], parseDisk),
  commandCollector("pending_updates", "softwareupdate", ["-l"], (output) =>
    record("pending_updates", {
      available: (output.match(/^ {2}\* /gm) ?? []).length || null,
      stuck: false,
    })
  ),
  serviceCollector(),
  commandCollector("security_tool_status", "spctl", ["--status"], (output) =>
    record("security_tool_status", {
      gatekeeper: /assessments enabled/i.test(output),
    })
  ),
];
