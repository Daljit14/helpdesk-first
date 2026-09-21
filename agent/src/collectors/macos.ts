import type { DiagnosticKind } from "../../../lib/device-agent/protocol";
import { boundedError, record, type Collector } from "./index";
function simple(kind: DiagnosticKind, file: string, args: string[]): Collector {
  return {
    kind,
    run: async (exec) => {
      try {
        return record(kind, (await exec(file, args)).slice(0, 500));
      } catch (error) {
        return boundedError(kind, error);
      }
    },
  };
}
export const macosCollectors: Collector[] = [
  simple("network_status", "ifconfig", []),
  simple("dns_resolution", "scutil", ["--dns"]),
  simple("wifi_status", "networksetup", ["-getairportnetwork", "en0"]),
  simple("vpn_status", "scutil", ["--nc", "list"]),
  simple("disk_space", "df", ["-k"]),
  simple("pending_updates", "softwareupdate", ["-l"]),
  simple("service_status", "launchctl", ["list"]),
  simple("browser_extensions", "find", [
    "/Library/Application Support",
    "-maxdepth",
    "1",
    "-type",
    "d",
  ]),
  simple("security_tool_status", "launchctl", ["list"]),
];
