import { createHash } from "node:crypto";
import type { DeviceAction } from "../../lib/device-agent/catalog";
import type {
  DiagnosticRecord,
  DevicePlatform,
  ShadowAction,
} from "../../lib/device-agent/protocol";

export function planShadow(
  catalog: readonly DeviceAction[],
  diagnostics: readonly DiagnosticRecord[],
  platform: DevicePlatform
): ShadowAction[] {
  const find = (kind: DiagnosticRecord["kind"]) =>
    diagnostics.find((item) => item.kind === kind);
  const actions: Array<{
    id: string;
    params: Record<string, string>;
    reason: string;
    kinds: DiagnosticRecord["kind"][];
  }> = [];
  if (find("dns_resolution")?.ok === false)
    actions.push({
      id: "device_flush_dns",
      params: {},
      reason: "DNS resolution failed.",
      kinds: ["dns_resolution"],
    });
  if (find("wifi_status")?.data.connected === false)
    actions.push({
      id: "device_reset_wifi_profile",
      params: {},
      reason: "Wi-Fi is disconnected.",
      kinds: ["wifi_status"],
    });
  if (find("network_status")?.data.connected === false)
    actions.push({
      id: "device_reset_network_adapter",
      params: {},
      reason: "Network adapter is unavailable.",
      kinds: ["network_status"],
    });
  if (find("vpn_status")?.data.connected === false)
    actions.push({
      id: "device_restart_service",
      params: { serviceName: "vpn" },
      reason: "VPN is disconnected.",
      kinds: ["vpn_status"],
    });
  if (
    find("disk_space")?.data.freePercent &&
    Number(find("disk_space")?.data.freePercent) < 5
  )
    actions.push({
      id: "device_cleanup_temp_files",
      params: {},
      reason: "Disk is almost full.",
      kinds: ["disk_space"],
    });
  const security = find("security_tool_status");
  if (security?.data.realTimeProtection === false)
    actions.push({
      id: "device_security_enable_realtime_protection",
      params: {},
      reason: "Endpoint real-time protection is disabled.",
      kinds: ["security_tool_status"],
    });
  if (
    typeof security?.data.threatCount === "number" &&
    security.data.threatCount > 0
  )
    actions.push({
      id: "device_security_remove_detected_threats",
      params: {},
      reason: "Detected endpoint threats require review.",
      kinds: ["security_tool_status"],
    });
  const printers = find("printers");
  if (
    typeof printers?.data.jobCount === "number" &&
    printers.data.jobCount > 0 &&
    printers.data.spooler !== "running" &&
    printers.data.cups !== "running"
  )
    actions.push({
      id: "device_printer_clear_queue",
      params: {},
      reason: "Printer jobs are queued while the print service is stopped.",
      kinds: ["printers"],
    });
  const audio = find("audio");
  if (audio?.data.running === false)
    actions.push({
      id: "device_audio_restart",
      params: {},
      reason: "The audio service is not running.",
      kinds: ["audio"],
    });
  return actions.flatMap((item) => {
    const action = catalog.find(
      (candidate) =>
        candidate.id === item.id && candidate.platforms.includes(platform)
    );
    if (!action) return [];
    const canonical = JSON.stringify(item.params);
    return [
      {
        actionId: action.id,
        actionVersion: action.version,
        parametersHash: createHash("sha256").update(canonical).digest("hex"),
        reason: item.reason,
        evidenceKinds: item.kinds,
        snapshotSpec: action.snapshotSpec,
        irreversible: action.irreversible,
      },
    ];
  });
}
