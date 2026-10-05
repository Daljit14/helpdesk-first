import { readdir } from "node:fs/promises";
import type { DiagnosticKind } from "../../../lib/device-agent/protocol";
import { boundedError, record, type Collector } from "./index";
import { LINUX_SERVICE_COMMANDS, SERVICE_NAMES } from "../service-maps";
import { userSystemctl } from "../user-systemctl";
import { kerberosCredentialCollector } from "./kerberos";
import {
  allowlistedAppDisplayName,
  recentErrorEventsRecord,
  type RecentErrorCategory,
} from "./error-events";

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

function parsePrinters(printers: string, jobs: string, cups: string) {
  const names = printers
    .split(/\r?\n/)
    .filter((line) => /^printer\s+/i.test(line))
    .map((line) => line.replace(/^printer\s+/i, "").split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 40)
    .map((name) => name.slice(0, 80));
  return record("printers", {
    names,
    jobCount: jobs.split(/\r?\n/).filter(Boolean).length,
    cups: /active|running/i.test(cups) ? "running" : "stopped",
  });
}

function parseAudio(pipewire: string, pulse: string, pactl: string) {
  const statuses = [pipewire.trim(), pulse.trim()].filter(Boolean);
  return record("audio", {
    pipewire: pipewire.trim().slice(0, 80) || "unknown",
    pulseaudio: pulse.trim().slice(0, 80) || "unknown",
    defaultSink:
      pactl
        .match(/^\s*Default Sink:\s*(.+)$/im)?.[1]
        ?.trim()
        .slice(0, 80) ?? null,
    running: statuses.some((status) => /active|running/i.test(status)),
  });
}

export function cameraPrivacyCollector(
  readDirectory: (path: string) => Promise<string[]> = readdir
): Collector {
  return {
    kind: "camera_privacy",
    run: async () => {
      try {
        const entries = await readDirectory("/dev");
        const devicesPresent = entries.filter((entry) =>
          /^video\d+$/.test(entry)
        ).length;
        return record("camera_privacy", {
          userAccess: "unknown",
          systemAccess: "unknown",
          devicesPresent,
          blocked: false,
        });
      } catch (error) {
        return boundedError("camera_privacy", error);
      }
    },
  };
}

function microphonePrivacyCollector(): Collector {
  return {
    kind: "mic_privacy",
    run: async (exec) => {
      let devicesPresent: number | null = null;
      let muted: boolean | null = null;
      try {
        const output = await exec("pactl", ["list", "short", "sources"]);
        devicesPresent = output
          .split(/\r?\n/)
          .filter((line) => line.trim() && !line.includes(".monitor")).length;
      } catch {
        devicesPresent = null;
      }
      try {
        const output = await exec("pactl", [
          "get-source-mute",
          "@DEFAULT_SOURCE@",
        ]);
        if (/\byes\b/i.test(output)) muted = true;
        else if (/\bno\b/i.test(output)) muted = false;
      } catch {
        muted = null;
      }
      return record("mic_privacy", {
        userAccess: "unknown",
        systemAccess: "unknown",
        devicesPresent,
        muted,
        blocked: muted === true,
      });
    },
  };
}

function linuxErrorCategory(identifier: string): RecentErrorCategory {
  const name = identifier.toLowerCase();
  if (name === "systemd-coredump") return "appCrash";
  if (name === "kernel") return "driver";
  if (
    [
      "networkmanager",
      "systemd-resolved",
      "systemd-networkd",
      "wpa_supplicant",
      "dhclient",
    ].includes(name)
  ) {
    return "network";
  }
  if (["sssd", "sssd_be", "krb5kdc", "gdm-password", "login"].includes(name)) {
    return "signIn";
  }
  if (["udisksd", "smartd"].includes(name)) return "disk";
  return "other";
}

function linuxJournalTimestamp(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const microseconds = Number(value);
  if (!Number.isFinite(microseconds)) return null;
  const date = new Date(microseconds / 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseLinuxErrorEvents(output: string) {
  const events = output
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 500)
    .flatMap((line) => {
      let row: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(line);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          return [];
        row = parsed as Record<string, unknown>;
      } catch {
        return [];
      }
      const identifier =
        typeof row.SYSLOG_IDENTIFIER === "string" &&
        row.SYSLOG_IDENTIFIER.trim()
          ? row.SYSLOG_IDENTIFIER
          : typeof row._COMM === "string"
            ? row._COMM
            : "";
      const category = linuxErrorCategory(identifier);
      const process =
        category === "appCrash" && typeof row.COREDUMP_COMM === "string"
          ? row.COREDUMP_COMM
          : null;
      return [
        {
          category,
          at: linuxJournalTimestamp(row.__REALTIME_TIMESTAMP),
          app:
            category === "appCrash" ? allowlistedAppDisplayName(process) : null,
        },
      ];
    });
  return recentErrorEventsRecord(events, ["appHang"]);
}

function recentErrorEventsCollector(): Collector {
  return {
    kind: "recent_error_events",
    run: async (exec) => {
      try {
        const output = await exec(
          "journalctl",
          [
            "--priority=3",
            "--since=-24h",
            "--output=json",
            "--no-pager",
            "--lines=500",
          ],
          { timeoutMs: 15_000 }
        );
        return parseLinuxErrorEvents(output);
      } catch {
        return boundedError("recent_error_events", "command failed");
      }
    },
  };
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
  {
    kind: "printers",
    run: async (exec) => {
      let printers = "";
      let jobs = "";
      let cups = "";
      try {
        printers = await exec("lpstat", ["-p"]);
      } catch {}
      try {
        jobs = await exec("lpstat", ["-o"]);
      } catch {}
      try {
        cups = await exec("systemctl", ["is-active", "cups"]);
      } catch {}
      return parsePrinters(printers, jobs, cups);
    },
  },
  {
    kind: "audio",
    run: async (exec) => {
      let pipewire = "";
      let pulse = "";
      let pactl = "";
      try {
        pipewire = await userSystemctl(exec, ["is-active", "pipewire"]);
      } catch {}
      try {
        pulse = await userSystemctl(exec, ["is-active", "pulseaudio"]);
      } catch {}
      try {
        pactl = await exec("pactl", ["info"]);
      } catch {}
      return parseAudio(pipewire || "unknown", pulse || "unknown", pactl);
    },
  },
  cameraPrivacyCollector(),
  microphonePrivacyCollector(),
  kerberosCredentialCollector(),
  recentErrorEventsCollector(),
];
