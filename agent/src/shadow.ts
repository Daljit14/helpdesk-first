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
