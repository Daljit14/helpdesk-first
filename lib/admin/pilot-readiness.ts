import type { createAdminClient } from "@/lib/supabase/admin";
import latest from "@/docs/eval/latest.json";
import {
  getPilotCapabilityAllowlist,
  getPilotOrgAllowlist,
  guardrailsEnforced,
  isAutonomousExecutionEnabled,
} from "@/lib/autonomy/config";
import { listCapabilities } from "@/lib/autonomy/capabilities/registry";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import { isAlertingConfigured } from "@/lib/autonomy/alerts";
import { BENCHMARK_VERSION } from "@/lib/autonomy/eval/benchmark/version";
import { isConnectorKeyValid } from "@/lib/security/connector-key";
import { getResearchConfig } from "@/lib/autonomy/config";
import { isOrgEncryptionEnabled } from "@/lib/security/data-protection-config";
import { isMasterKeyValid } from "@/lib/security/master-key";
import { countPlaintextRowsDetailed } from "@/lib/security/backfill";
import {
  isDeviceAgentEnabled,
  isDeviceExecutionEnabled,
  isRequesterAgentActionsEnabled,
  isRequesterAgentEnabled,
} from "./flags";

type Admin = ReturnType<typeof createAdminClient>;

export type PilotReadinessItem = {
  label: string;
  ready: boolean;
  reason: string;
};

export type PilotReadiness = {
  items: PilotReadinessItem[];
  ready: boolean;
  verdict: string;
  executionEnabled: boolean;
};

export async function computePilotReadiness(
  admin: Admin,
  organizationId: string
): Promise<PilotReadiness> {
  const orgAllowlist = getPilotOrgAllowlist();
  const capabilityAllowlist = getPilotCapabilityAllowlist();
  const enabledCapabilities = listCapabilities().map(
    (capability) => capability.id
  );
  const capabilitySubset =
    capabilityAllowlist === null ||
    capabilityAllowlist.every((id) => enabledCapabilities.includes(id));
  const [switches, breakers, tables] = await Promise.all([
    readKillSwitches(admin, organizationId),
    admin
      .from("capability_breakers")
      .select("state")
      .eq("organization_id", organizationId),
    Promise.all(
      ["pilot_reviews", "shadow_decisions", "resolution_events"].map(
        async (table) => {
          const result = await admin.from(table).select("id", { head: true });
          return !result.error;
        }
      )
    ),
  ]);
  const encryptionEnabled = isOrgEncryptionEnabled();
  const encryptionKeyValid = isMasterKeyValid();
  let plaintextResult: Awaited<
    ReturnType<typeof countPlaintextRowsDetailed>
  > | null = null;
  let plaintextCountError: string | null = null;
  if (encryptionEnabled && encryptionKeyValid) {
    try {
      plaintextResult = await countPlaintextRowsDetailed(admin, organizationId);
    } catch (error) {
      plaintextCountError =
        error instanceof Error && error.message ? error.message : "unknown";
    }
  }
  const plaintextRemaining = plaintextResult
    ? Object.values(plaintextResult.counts).reduce(
        (sum, count) => sum + count,
        0
      )
    : 0;
  let deviceReady = true;
  const deviceExecutionMode = isDeviceExecutionEnabled() ? "live" : "shadow";
  let deviceReason = `disabled (execution: ${deviceExecutionMode})`;
  if (isDeviceAgentEnabled()) {
    if (isDeviceExecutionEnabled()) {
      deviceReady = false;
      deviceReason = `device execution is not available before B3 (execution: ${deviceExecutionMode})`;
    } else {
      try {
        const devices = await admin
          .from("devices")
          .select("id", { count: "exact" })
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .limit(1);
        if (devices.error || devices.count === null) {
          deviceReady = false;
          deviceReason =
            "active device count unavailable (apply supabase/device-agent.sql) " +
            `(execution: ${deviceExecutionMode})`;
        } else {
          deviceReason = `${devices.count} active devices (execution: ${deviceExecutionMode})`;
        }
      } catch (error) {
        deviceReady = false;
        deviceReason = `active device count failed: ${
          error instanceof Error && error.message ? error.message : "unknown"
        } (execution: ${deviceExecutionMode})`;
      }
    }
  }
  const connector = process.env.HELP_DESK_CONNECTOR_KEY
    ? await admin
        .from("organization_connectors")
        .select("status,last_health_ok,allowed_group_ids")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .maybeSingle()
    : { data: null, error: null };
  const grantEnabled =
    capabilityAllowlist?.includes("grant_group_access") ?? false;
  const items: PilotReadinessItem[] = [
    {
      label: "Requester agent",
      ready: true,
      reason: isRequesterAgentEnabled()
        ? `on for ${
            (process.env.HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean).length
          } orgs; tables present; actions ${
            isRequesterAgentActionsEnabled() ? "on" : "off"
          }`
        : "off (flag); tables must be applied before enabling",
    },
    {
      label: "Device agent",
      ready: deviceReady,
      reason: deviceReason,
    },
    {
      label: "External research",
      ready:
        !getResearchConfig().enabled ||
        (getResearchConfig().provider === "brave"
          ? Boolean(process.env.BRAVE_SEARCH_API_KEY)
          : Boolean(process.env.TAVILY_API_KEY)),
      reason: !getResearchConfig().enabled
        ? "disabled"
        : "The configured research provider key must be present.",
    },
    {
      label: "Guardrails enforced",
      ready: guardrailsEnforced(),
      reason: "HELP_DESK_GUARDRAILS_ENFORCED must not be false.",
    },
    {
      label: "Organization allow-list",
      ready: orgAllowlist.length > 0 && orgAllowlist.includes(organizationId),
      reason: "The current organization must be explicitly allow-listed.",
    },
    {
      label: "Capability allow-list",
      ready: capabilitySubset,
      reason: "Every pilot capability must exist in the registry.",
    },
    {
      label: "Pilot tables",
      ready: tables.every(Boolean),
      reason:
        "Pilot reviews, shadow decisions, and guardrail events must exist.",
    },
    {
      label: "Breaker closed",
      ready:
        !breakers.error &&
        (breakers.data ?? []).every(
          (row: { state?: unknown }) => row.state !== "open"
        ),
      reason: "Every organization capability breaker must be closed.",
    },
    {
      label: "Organization kill switch off",
      ready: !switches.organization,
      reason: "An organization kill switch pauses the pilot.",
    },
    {
      label: "Identity connector",
      ready:
        connector.data?.status === "active" &&
        connector.data.last_health_ok === true,
      reason:
        "An active identity connector must have a successful health check.",
    },
    {
      label: "Connector encryption key",
      ready: isConnectorKeyValid(),
      reason: "HELP_DESK_CONNECTOR_KEY must decode to 32 bytes.",
    },
    {
      label: "Data protection",
      ready:
        !encryptionEnabled ||
        (encryptionKeyValid && plaintextCountError === null),
      reason: !encryptionEnabled
        ? "disabled"
        : !encryptionKeyValid
          ? "HELP_DESK_MASTER_KEY must decode to 32 bytes."
          : plaintextCountError
            ? `plaintext count failed: ${plaintextCountError}`
            : `backfill ${
                plaintextResult?.truncated ? "1000+" : plaintextRemaining
              } rows remaining`,
    },
    ...(grantEnabled
      ? [
          {
            label: "Allowed groups configured",
            ready: (connector.data?.allowed_group_ids ?? []).length > 0,
            reason:
              "Granting group access requires at least one allow-listed group.",
          },
        ]
      : []),
    {
      label: "Alert email configured",
      ready: isAlertingConfigured(),
      reason: "BREVO_API_KEY and NOTIFICATIONS_FROM_EMAIL are required.",
    },
    {
      label: "Latest benchmark report",
      ready:
        latest.version === BENCHMARK_VERSION &&
        latest.gatesPassed === latest.gatesTotal,
      reason: `The latest report must be ${BENCHMARK_VERSION} with all gates passing.`,
    },
  ];
  const blockers = items.filter((item) => !item.ready).length;
  return {
    items,
    ready: blockers === 0,
    verdict:
      blockers === 0
        ? "Ready to enable"
        : `Not ready (${blockers} ${blockers === 1 ? "blocker" : "blockers"})`,
    executionEnabled: isAutonomousExecutionEnabled(),
  };
}
