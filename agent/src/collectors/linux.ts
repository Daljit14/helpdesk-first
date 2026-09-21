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
export const linuxCollectors: Collector[] = [
  simple("network_status", "nmcli", ["-t"]),
  simple("dns_resolution", "resolvectl", ["status"]),
  simple("wifi_status", "nmcli", ["-t", "device", "wifi"]),
  simple("vpn_status", "nmcli", ["-t", "connection", "show", "--active"]),
  simple("disk_space", "df", ["-k"]),
  simple("pending_updates", "printf", ["not available"]),
  simple("service_status", "systemctl", ["is-active", "systemd-resolved"]),
  simple("browser_extensions", "printf", ["read-only enumeration unavailable"]),
  simple("security_tool_status", "systemctl", ["is-active", "clamav-daemon"]),
];
