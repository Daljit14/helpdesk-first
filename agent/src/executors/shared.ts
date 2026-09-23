import type {
  DiagnosticKind,
  DiagnosticRecord,
  DevicePlatform,
} from "../../../lib/device-agent/protocol";
import { linuxCollectors } from "../collectors/linux";
import { macosCollectors } from "../collectors/macos";
import { dnsCollector } from "../collectors/shared";
import { windowsCollectors } from "../collectors/windows";
import type { AgentExec, Collector } from "../collectors/index";
import type { SnapshotData } from ".";

function collectors(platform: DevicePlatform): Collector[] {
  return platform === "windows"
    ? windowsCollectors
    : platform === "macos"
      ? macosCollectors
      : linuxCollectors;
}

export async function runDiagnostic(
  platform: DevicePlatform,
  kind: DiagnosticKind,
  exec: AgentExec
): Promise<DiagnosticRecord> {
  const collector =
    kind === "dns_resolution"
      ? dnsCollector()
      : collectors(platform).find((candidate) => candidate.kind === kind);
  if (!collector) throw new Error("diagnostic_unavailable");
  return collector.run(exec);
}

export function requiredString(
  value: unknown,
  error = "invalid_parameters"
): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(error);
  return value;
}

export function snapshotString(snapshot: SnapshotData, key: string): string {
  return requiredString(snapshot[key], "snapshot_invalid");
}

export function truncate(value: string): string {
  return value.slice(0, 500);
}

export function serviceStatus(
  record: DiagnosticRecord,
  serviceName: string
): string {
  const value = record.data[serviceName];
  return typeof value === "string" ? value : "unknown";
}
