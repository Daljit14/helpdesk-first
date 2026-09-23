import type { CapabilityDefinition, CapabilityPlatform } from "./types";
import { DEVICE_ACTIONS } from "@/lib/device-agent/catalog";

const platformMap: Record<string, CapabilityPlatform> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

function preconditions() {
  return [
    {
      id: "requester_has_active_device",
      description:
        "The requester has an active device matching the ticket platform.",
    },
  ];
}

export function deviceCapabilityDefinitions(): CapabilityDefinition[] {
  return DEVICE_ACTIONS.map((action) => ({
    id: action.id,
    version: action.version,
    platforms: action.platforms.map((platform) => platformMap[platform]),
    department: "Integrations",
    description: action.description,
    inputSchema: action.inputSchema,
    preconditions: preconditions(),
    riskLevel: action.sideEffects === "read_only" ? "safe" : "caution",
    consent: action.irreversible ? "user" : "none",
    orgPolicyRequirements: [],
    maxRuntimeMs: 120_000,
    expectedResult: `Device job ${action.id} is reported by the enrolled agent.`,
    verification: "device_job_completed",
    rollback: action.snapshotSpec.length
      ? "handler:device_restore_snapshot"
      : "none",
    owner: action.owner,
    reviewDate: action.reviewDate,
    sideEffects:
      action.sideEffects === "read_only" ? "read_only" : "external_write",
  }));
}
