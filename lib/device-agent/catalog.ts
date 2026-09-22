import { createHash } from "node:crypto";
import { z } from "zod";
import {
  diagnosticKindSchema,
  type DeviceActionPublic,
  type DevicePlatform,
} from "./protocol";

export type DeviceAction = {
  id: `device_${string}`;
  version: number;
  platforms: DevicePlatform[];
  description: string;
  riskLevel: "safe" | "caution";
  sideEffects: "read_only" | "local_write";
  reversible: boolean;
  irreversible: boolean;
  consent: "none" | "user";
  snapshotSpec: string[];
  requiresDiagnostics: z.infer<typeof diagnosticKindSchema>[];
  owner: string;
  reviewDate: string;
  inputSchema: z.ZodType;
};

const noInput = z.object({}).strict();
const serviceInput = z.object({
  serviceName: z.enum([
    "vpn",
    "sso_helper",
    "print_spooler",
    "windows_update",
    "defender",
  ]),
});
const wifiInput = z.object({ ssid: z.string().min(1).max(128) }).strict();

const readOnly = (
  id: DeviceAction["id"],
  description: string,
  requiresDiagnostics: DeviceAction["requiresDiagnostics"]
): DeviceAction => ({
  id,
  version: 1,
  platforms: ["windows", "macos", "linux"],
  description,
  riskLevel: "safe",
  sideEffects: "read_only",
  reversible: true,
  irreversible: false,
  consent: "none",
  snapshotSpec: [],
  requiresDiagnostics,
  owner: "device-agent",
  reviewDate: "2099-01-01",
  inputSchema: noInput,
});

export const DEVICE_ACTIONS: readonly DeviceAction[] = [
  readOnly("device_network_status", "Read network interface status.", [
    "network_status",
  ]),
  readOnly("device_dns_resolution_test", "Test DNS resolution.", [
    "dns_resolution",
  ]),
  readOnly("device_wifi_status", "Read Wi-Fi connection status.", [
    "wifi_status",
  ]),
  readOnly("device_vpn_client_status", "Read VPN client status.", [
    "vpn_status",
  ]),
  readOnly("device_disk_space_check", "Read disk space.", ["disk_space"]),
  readOnly(
    "device_pending_updates_check",
    "Read pending operating system updates.",
    ["pending_updates"]
  ),
  {
    ...readOnly("device_service_status", "Read allow-listed service status.", [
      "service_status",
    ]),
    inputSchema: serviceInput,
  },
  readOnly("device_browser_extensions_list", "Read browser extension names.", [
    "browser_extensions",
  ]),
  readOnly("device_security_tool_status", "Read endpoint protection status.", [
    "security_tool_status",
  ]),
  {
    ...readOnly(
      "device_flush_dns",
      "Flush the local DNS cache in a later phase.",
      ["dns_resolution"]
    ),
    riskLevel: "caution",
    sideEffects: "local_write",
    snapshotSpec: ["dns_cache_stats"],
  },
  {
    ...readOnly(
      "device_reset_network_adapter",
      "Reset a network adapter in a later phase.",
      ["network_status"]
    ),
    riskLevel: "caution",
    sideEffects: "local_write",
    snapshotSpec: ["adapter_config", "ip_config"],
  },
  {
    ...readOnly(
      "device_reset_wifi_profile",
      "Reset a Wi-Fi profile in a later phase.",
      ["wifi_status"]
    ),
    riskLevel: "caution",
    sideEffects: "local_write",
    snapshotSpec: ["wifi_profile"],
    inputSchema: wifiInput,
  },
  {
    ...readOnly(
      "device_restart_service",
      "Restart an allow-listed service in a later phase.",
      ["service_status"]
    ),
    riskLevel: "caution",
    sideEffects: "local_write",
    snapshotSpec: ["service_state"],
    inputSchema: serviceInput,
  },
  {
    ...readOnly(
      "device_cleanup_temp_files",
      "Clean temporary files in a later phase.",
      ["disk_space"]
    ),
    riskLevel: "caution",
    sideEffects: "local_write",
    reversible: false,
    irreversible: true,
    consent: "user",
  },
];

export function validateDeviceCatalog(
  actions: readonly DeviceAction[]
): string[] {
  const errors: string[] = [];
  const pairs = new Set<string>();
  const prohibited =
    /\b(?:malware|quarantine|password|mfa|remote desktop|shell|script)\b/i;
  for (const action of actions) {
    const pair = `${action.id}:${action.version}`;
    if (pairs.has(pair)) errors.push(`duplicate ${pair}`);
    pairs.add(pair);
    if (!action.id.startsWith("device_"))
      errors.push(`${action.id}: invalid id`);
    if (!action.platforms.length) errors.push(`${action.id}: no platforms`);
    if (prohibited.test(`${action.id} ${action.description}`))
      errors.push(`${action.id}: prohibited`);
    if (Date.parse(action.reviewDate) <= Date.now())
      errors.push(`${action.id}: review date`);
    if (
      action.sideEffects === "read_only" &&
      (!action.reversible || action.snapshotSpec.length > 0)
    )
      errors.push(`${action.id}: read-only safety metadata`);
    if (action.irreversible && action.consent !== "user")
      errors.push(`${action.id}: consent`);
    if (action.irreversible && action.reversible)
      errors.push(`${action.id}: reversible irreversible`);
  }
  return errors;
}

const catalogErrors = validateDeviceCatalog(DEVICE_ACTIONS);
if (catalogErrors.length) throw new Error(catalogErrors.join(", "));

export const DEVICE_CATALOG_VERSION = "2026-09-21.1";

export function deviceCatalogChecksum(): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        DEVICE_ACTIONS.map((action) => {
          const { inputSchema, ...publicAction } = action;
          void inputSchema;
          return publicAction;
        })
      )
    )
    .digest("hex");
}

export function getDeviceAction(
  id: string,
  version: number
): DeviceAction | null {
  return (
    DEVICE_ACTIONS.find(
      (action) => action.id === id && action.version === version
    ) ?? null
  );
}

export function publicCatalog(): DeviceActionPublic[] {
  return DEVICE_ACTIONS.map((action) => {
    const { inputSchema, ...publicAction } = action;
    void inputSchema;
    return publicAction;
  });
}
