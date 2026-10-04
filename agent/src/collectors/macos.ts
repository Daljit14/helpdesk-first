import type { DiagnosticKind } from "../../../lib/device-agent/protocol";
import { boundedError, record, type Collector } from "./index";
import { MACOS_SERVICE_COMMANDS, SERVICE_NAMES } from "../service-maps";
import { kerberosCredentialCollector } from "./kerberos";

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
    cups: cups.trim() ? "running" : "stopped",
  });
}

function parseAudio(processes: string, profile: string) {
  const defaultOutput =
    profile.match(/"(_name|name)"\s*:\s*"([^"]+)"/i)?.[2] ?? null;
  return record("audio", {
    coreaudiod: processes.trim().length > 0,
    running: processes.trim().length > 0,
    defaultOutput: defaultOutput?.slice(0, 80) ?? null,
  });
}

function cameraPrivacyCollector(): Collector {
  return {
    kind: "camera_privacy",
    run: async (exec) => {
      try {
        const output = await exec("system_profiler", [
          "SPCameraDataType",
          "-json",
        ]);
        const root = JSON.parse(output) as Record<string, unknown>;
        const cameras = root.SPCameraDataType;
        return record("camera_privacy", {
          userAccess: "unknown",
          systemAccess: "unknown",
          devicesPresent: Array.isArray(cameras) ? cameras.length : null,
          blocked: false,
        });
      } catch (error) {
        return boundedError("camera_privacy", error);
      }
    },
  };
}

function audioInputCount(output: string): number | null {
  const root = JSON.parse(output) as Record<string, unknown>;
  const audio = root.SPAudioDataType;
  if (!Array.isArray(audio)) return null;
  let count = 0;
  const visit = (items: unknown[]) => {
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const value = item as Record<string, unknown>;
      if (
        Object.hasOwn(value, "coreaudio_input_source") ||
        Object.hasOwn(value, "coreaudio_device_input")
      ) {
        count += 1;
      }
      if (Array.isArray(value._items)) visit(value._items);
    }
  };
  visit(audio);
  return count;
}

function microphonePrivacyCollector(): Collector {
  return {
    kind: "mic_privacy",
    run: async (exec) => {
      try {
        const profiler = await exec("system_profiler", [
          "SPAudioDataType",
          "-json",
        ]);
        const devicesPresent = audioInputCount(profiler);
        let muted: boolean | null = null;
        try {
          const output = await exec("osascript", [
            "-e",
            "input volume of (get volume settings)",
          ]);
          const value = output.trim() ? Number(output.trim()) : NaN;
          muted = Number.isFinite(value) ? value === 0 : null;
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
      } catch (error) {
        return boundedError("mic_privacy", error);
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
  {
    kind: "printers",
    run: async (exec) => {
      try {
        const printers = await exec("lpstat", ["-p"]);
        const jobs = await exec("lpstat", ["-o"]);
        const cups = await exec("launchctl", [
          "print",
          "system/org.cups.cupsd",
        ]);
        return parsePrinters(printers, jobs, cups);
      } catch (error) {
        return boundedError("printers", error);
      }
    },
  },
  {
    kind: "audio",
    run: async (exec) => {
      try {
        let processes = "";
        try {
          processes = await exec("pgrep", ["coreaudiod"]);
        } catch {
          // pgrep exits non-zero when coreaudiod is stopped.
        }
        const profile = await exec("system_profiler", [
          "SPAudioDataType",
          "-json",
        ]);
        return parseAudio(processes, profile);
      } catch (error) {
        return boundedError("audio", error);
      }
    },
  },
  cameraPrivacyCollector(),
  microphonePrivacyCollector(),
  kerberosCredentialCollector(),
];
