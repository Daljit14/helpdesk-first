import type { DiagnosticKind } from "../../../lib/device-agent/protocol";
import { boundedError, record, type Collector } from "./index";
import { LINUX_SERVICE_COMMANDS, SERVICE_NAMES } from "../service-maps";

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
  const adaptersUp = output
    .split(/\r?\n/)
    .filter((line) => /:(connected|activated|up)(:|$)/i.test(line)).length;
  return record("network_status", { adaptersUp, connected: adaptersUp > 0 });
}

function parseWifi(output: string) {
  const [active = "", ...ssidParts] =
    output.split(/\r?\n/)[0]?.split(":") ?? [];
  const connected = active.toLowerCase() === "yes";
  return record("wifi_status", {
    connected,
    ssid: connected ? ssidParts.join(":") || null : null,
  });
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
        const unit = LINUX_SERVICE_COMMANDS[service];
        if (!unit) {
          data[service] = "unknown";
          continue;
        }
        try {
          const output = await exec("systemctl", ["is-active", unit]);
          data[service] = /active|running/i.test(output)
            ? "running"
            : "stopped";
        } catch {
          data[service] = "unknown";
          failed = true;
        }
      }
      return record("service_status", data, !failed);
    },
  };
}

export const linuxCollectors: Collector[] = [
  commandCollector("network_status", "nmcli", ["-t"], parseNetwork),
  commandCollector(
    "wifi_status",
    "nmcli",
    ["-t", "-f", "ACTIVE,SSID", "dev", "wifi"],
    parseWifi
  ),
  commandCollector(
    "vpn_status",
    "nmcli",
    ["-t", "connection", "show", "--active"],
    (output) =>
      record("vpn_status", {
        connected: output.trim().length > 0,
        required: false,
      })
  ),
  commandCollector("disk_space", "df", ["-k", "/"], parseDisk),
  {
    kind: "pending_updates",
    run: async () =>
      record("pending_updates", { available: null, stuck: false }),
  },
  serviceCollector(),
  {
    kind: "security_tool_status",
    run: async () => record("security_tool_status", { applicable: false }),
  },
];
