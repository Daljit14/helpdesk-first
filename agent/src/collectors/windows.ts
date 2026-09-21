import type { DiagnosticKind } from "../../../lib/device-agent/protocol";
import { boundedError, record, type Collector } from "./index";

function simple(kind: DiagnosticKind, command: string): Collector {
  return {
    kind,
    run: async (exec) => {
      try {
        return record(
          kind,
          (
            await exec("powershell.exe", [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              command,
            ])
          ).slice(0, 500)
        );
      } catch (error) {
        return boundedError(kind, error);
      }
    },
  };
}
export const windowsCollectors: Collector[] = [
  simple("network_status", "Get-NetAdapter | Select-Object Name,Status"),
  simple("wifi_status", "netsh wlan show interfaces"),
  simple("vpn_status", "Get-Service RasMan"),
  simple("disk_space", "Get-PSDrive -PSProvider FileSystem"),
  simple("pending_updates", "Write-Output 'not available'"),
  simple("service_status", "Get-Service"),
  simple("security_tool_status", "Get-MpComputerStatus"),
  {
    kind: "dns_resolution",
    run: async (exec) => {
      try {
        return record(
          "dns_resolution",
          (
            await exec("powershell.exe", [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "Resolve-DnsName www.microsoft.com",
            ])
          ).slice(0, 500)
        );
      } catch (error) {
        return boundedError("dns_resolution", error);
      }
    },
  },
  simple(
    "browser_extensions",
    "Write-Output 'read-only enumeration unavailable'"
  ),
];
